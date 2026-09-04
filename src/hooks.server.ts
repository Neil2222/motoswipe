import type { Handle, HandleServerError } from '@sveltejs/kit';
import { building } from '$app/environment';
import { randomUUID } from 'node:crypto';
import {
	SESSION_COOKIE,
	clearSessionCookie,
	purgeExpiredSessions,
	validateSession
} from '$lib/server/auth/session';
import { purgeStaleTokens } from '$lib/server/auth/tokens';
import { purgeStaleGuests } from '$lib/server/services/demo.service';
import { assertConfig, configWarnings, env } from '$lib/server/env';
import { isDomainError } from '$lib/server/errors';

// Fail fast on a misconfigured container, and say what is wrong.
//
// Skipped during `vite build`: SvelteKit imports this module to analyse routes,
// and an image build has no database credentials or session secret — nor should
// it. The check runs when the server actually boots.
if (!building) {
	assertConfig();
	for (const warning of configWarnings()) {
		console.warn(`[motoswipe] config: ${warning}`);
	}
}

/**
 * Attaches the session user to every request.
 *
 * This is the only place a session cookie is read. Route code sees
 * `locals.user` and nothing else, so there is no second implementation of
 * "who is this" to keep in sync.
 */
const authenticate: Handle = async ({ event, resolve }) => {
	const token = event.cookies.get(SESSION_COOKIE);

	if (token) {
		const session = await validateSession(token);
		if (session) {
			event.locals.user = session.user;
			event.locals.sessionId = session.sessionId;
		} else {
			// Stale or forged cookie: clear it so the browser stops sending it.
			event.locals.user = null;
			event.locals.sessionId = null;
			clearSessionCookie(event.cookies);
		}
	} else {
		event.locals.user = null;
		event.locals.sessionId = null;
	}

	return resolve(event);
};

/**
 * Security headers.
 *
 * The CSP is deliberately strict but has to accommodate SvelteKit's inline
 * hydration script; `unsafe-inline` for scripts would defeat the point, so
 * SvelteKit's nonce/hash handling is used via `csp` in svelte.config where
 * needed. Here we set the headers a reverse proxy typically does not.
 */
const securityHeaders: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);

	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	// No feature on this site needs any of these.
	response.headers.set(
		'Permissions-Policy',
		'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()'
	);
	response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
	response.headers.set('X-Robots-Tag', 'noindex, nofollow');

	if (env.isProduction) {
		// Only meaningful over https, which production is required to be.
		response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
	}

	return response;
};

/**
 * Expired-session housekeeping.
 *
 * A cron container for one DELETE would be silly, so this runs opportunistically
 * on request, at most once an hour, and never blocks the response.
 */
let lastPurge = 0;
const PURGE_INTERVAL_MS = 60 * 60 * 1000;

const housekeeping: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);

	if (Date.now() - lastPurge > PURGE_INTERVAL_MS) {
		lastPurge = Date.now();
		// Sessions first: a guest is only stale once its sessions are gone.
		purgeExpiredSessions()
			.then(async (sessions) => {
				if (sessions > 0) console.log(`[motoswipe] purged ${sessions} expired sessions`);
				const [guests, tokens] = await Promise.all([purgeStaleGuests(), purgeStaleTokens()]);
				if (guests > 0) console.log(`[motoswipe] purged ${guests} abandoned demo accounts`);
				if (tokens > 0) console.log(`[motoswipe] purged ${tokens} spent email tokens`);
			})
			.catch((error) => console.error('[motoswipe] housekeeping failed:', error));
	}

	return response;
};

/** SvelteKit runs these left to right. */
export const handle: Handle = async ({ event, resolve }) =>
	authenticate({
		event,
		resolve: (e1) =>
			securityHeaders({
				event: e1,
				resolve: (e2) => housekeeping({ event: e2, resolve })
			})
	});

/**
 * Unhandled errors.
 *
 * Production responses carry a correlation id and nothing else — no message, no
 * stack, no database detail. The full error goes to the server log where the id
 * can be matched up.
 */
export const handleError: HandleServerError = ({ error, event, status }) => {
	// Expected 404s are not worth a log line or an incident id.
	if (status === 404) {
		return { message: 'Not found' };
	}

	const code = randomUUID().slice(0, 8);

	console.error(`[motoswipe] error ${code} ${event.request.method} ${event.url.pathname}:`, error);

	if (isDomainError(error)) {
		return { message: error.message, code };
	}

	return {
		message: env.isProduction
			? 'Something went wrong on our side.'
			: error instanceof Error
				? error.message
				: String(error),
		code
	};
};
