import { RateLimitError } from '../errors';
import { env } from '../env';

/**
 * In-memory sliding-window rate limiter.
 *
 * Deliberately not Redis. MotoSwipe is a single-container self-hosted app; an
 * extra service to run and back up is a real cost, and losing the counters on
 * restart is not a meaningful attack. If you ever scale to multiple replicas,
 * swap the Map for a shared store — the interface below is the only seam that
 * has to change.
 *
 * Buckets are keyed by action + identifier (client address, or email for
 * credential stuffing against one account).
 */

interface Bucket {
	/** Timestamps of hits inside the window. */
	hits: number[];
	/** Set when the limit trips, so the block outlives the window. */
	blockedUntil: number;
}

const buckets = new Map<string, Bucket>();

/** Bounds memory: an attacker rotating keys cannot grow the map without limit. */
const MAX_BUCKETS = 20_000;

export interface RateLimitRule {
	/** Maximum hits allowed inside the window. */
	limit: number;
	windowMs: number;
	/** How long to lock out after the limit trips. Defaults to `windowMs`. */
	blockMs?: number;
}

export const RATE_LIMITS = {
	/** Per client address. Generous enough for a shared household NAT. */
	loginByIp: { limit: 20, windowMs: 10 * 60_000, blockMs: 10 * 60_000 },
	/** Per account. Tighter — one account should not see 20 failures in 10 min. */
	loginByAccount: { limit: 8, windowMs: 10 * 60_000, blockMs: 15 * 60_000 },
	passwordChange: { limit: 10, windowMs: 15 * 60_000 }
} as const satisfies Record<string, RateLimitRule>;

/**
 * Registration is read from configuration rather than fixed, because the right
 * number depends on the instance: a private family server needs several in a
 * row from one address, a public one does not. See env.registrationsPerHour.
 */
export function registerRule(): RateLimitRule {
	return {
		limit: env.registrationsPerHour,
		windowMs: 60 * 60_000,
		blockMs: 30 * 60_000
	};
}

function sweep(now: number): void {
	if (buckets.size < MAX_BUCKETS) return;
	for (const [key, bucket] of buckets) {
		if (bucket.blockedUntil < now && bucket.hits.length === 0) buckets.delete(key);
	}
	// Still full of live buckets: drop the oldest half rather than grow forever.
	if (buckets.size >= MAX_BUCKETS) {
		const keys = [...buckets.keys()].slice(0, Math.floor(MAX_BUCKETS / 2));
		for (const key of keys) buckets.delete(key);
	}
}

/**
 * Records an attempt and throws RateLimitError once the rule is exceeded.
 * Call before doing expensive work (a password hash costs ~50 ms of CPU).
 */
export function consume(action: string, identifier: string, rule: RateLimitRule): void {
	const now = Date.now();
	const key = `${action}:${identifier}`;
	sweep(now);

	let bucket = buckets.get(key);
	if (!bucket) {
		bucket = { hits: [], blockedUntil: 0 };
		buckets.set(key, bucket);
	}

	if (bucket.blockedUntil > now) {
		throw new RateLimitError(Math.ceil((bucket.blockedUntil - now) / 1000));
	}

	const cutoff = now - rule.windowMs;
	bucket.hits = bucket.hits.filter((t) => t > cutoff);
	bucket.hits.push(now);

	if (bucket.hits.length > rule.limit) {
		bucket.blockedUntil = now + (rule.blockMs ?? rule.windowMs);
		bucket.hits = [];
		throw new RateLimitError(Math.ceil((rule.blockMs ?? rule.windowMs) / 1000));
	}
}

/** Clears the counters for a key. Called after a successful login. */
export function reset(action: string, identifier: string): void {
	buckets.delete(`${action}:${identifier}`);
}

/** Test hook. */
export function resetAll(): void {
	buckets.clear();
}
