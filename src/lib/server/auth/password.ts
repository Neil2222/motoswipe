import { hash, verify } from '@node-rs/argon2';

/**
 * Argon2id password hashing.
 *
 * Parameters follow the OWASP Password Storage Cheat Sheet's Argon2id baseline
 * (19 MiB, t=2, p=1). They are tuned for a NAS, not a datacentre: memory cost
 * is the expensive dimension and a Synology box has little of it to spare.
 * Raising `memoryCost` later is safe — the parameters are encoded in the stored
 * hash, so old hashes keep verifying and only get upgraded on next login.
 */
// `algorithm` is deliberately omitted: @node-rs/argon2 defaults to Argon2id,
// and its Algorithm export is an ambient const enum, which `verbatimModuleSyntax`
// (correctly) refuses to inline. Naming the default buys nothing.
const OPTIONS = {
	memoryCost: 19_456, // KiB (19 MiB)
	timeCost: 2,
	parallelism: 1
} as const;

export async function hashPassword(plain: string): Promise<string> {
	return hash(plain, OPTIONS);
}

/**
 * Verifies a password. Returns false on a malformed or unrecognised hash rather
 * than throwing, so a corrupted row cannot turn a failed login into a 500 that
 * leaks a stack trace.
 */
export async function verifyPassword(storedHash: string, plain: string): Promise<boolean> {
	try {
		return await verify(storedHash, plain);
	} catch {
		return false;
	}
}

/**
 * A dummy hash of a random value, verified against when no user matches the
 * submitted identifier. Without it, "unknown email" returns in ~1 ms while a
 * real account takes ~50 ms, and that difference enumerates your user base.
 */
let dummyHash: string | null = null;

export async function equalizeLoginTiming(submittedPassword: string): Promise<void> {
	dummyHash ??= await hashPassword(`no-such-user-${crypto.randomUUID()}`);
	await verifyPassword(dummyHash, submittedPassword);
}

/**
 * True when a stored hash was produced with weaker parameters than the current
 * OPTIONS and should be re-hashed after a successful login.
 */
export function needsRehash(storedHash: string): boolean {
	const match = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$/.exec(storedHash);
	if (!match) return true; // Unknown format — not argon2id at our settings.
	const [, m, t, p] = match;
	return (
		Number(m) < OPTIONS.memoryCost ||
		Number(t) < OPTIONS.timeCost ||
		Number(p) !== OPTIONS.parallelism
	);
}
