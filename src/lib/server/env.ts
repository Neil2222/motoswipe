/**
 * Validated server configuration.
 *
 * Read from `process.env` rather than SvelteKit's `$env/static/private` for two
 * reasons: a static import bakes build-time values into the bundle, which is
 * exactly wrong for a Docker image published once and deployed with different
 * settings; and it would tie this module to the SvelteKit runtime, which the
 * seed and import CLIs do not have.
 *
 * Validation is lazy — importing this module never throws, reading a
 * misconfigured value does. That keeps `vite build` and `tsx scripts/...`
 * working on machines with no database credentials, while a production server
 * still refuses to serve requests with a default session secret. Startup calls
 * `assertConfig()` to turn the lazy checks into a loud failure at boot.
 */

import { config as loadDotenv } from 'dotenv';

/**
 * Load a local `.env` if there is one.
 *
 * Vite only exposes `VITE_`-prefixed variables to `import.meta.env` and does
 * not populate `process.env`, so without this a `npm run dev` would not see
 * DATABASE_URL. In Docker there is no .env file and compose has already put
 * everything in the environment, so this is a no-op there. Existing variables
 * are never overridden — the real environment always wins.
 */
loadDotenv({ quiet: true, override: false });

function bool(name: string, fallback: boolean): boolean {
	const raw = process.env[name];
	if (raw === undefined || raw === '') return fallback;
	return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

function int(name: string, fallback: number): number {
	const raw = process.env[name];
	if (raw === undefined || raw === '') return fallback;
	const parsed = Number.parseInt(raw, 10);
	if (!Number.isFinite(parsed)) {
		throw new Error(`Environment variable ${name} must be an integer, got "${raw}".`);
	}
	return parsed;
}

const DEV_SESSION_SECRET = 'motoswipe-development-only-secret-do-not-use-in-production';

export const env = {
	get nodeEnv(): string {
		return process.env.NODE_ENV ?? 'development';
	},

	get isProduction(): boolean {
		return this.nodeEnv === 'production';
	},

	get isTest(): boolean {
		return this.nodeEnv === 'test' || process.env.VITEST !== undefined;
	},

	get databaseUrl(): string {
		const value = process.env.DATABASE_URL;
		if (!value) {
			throw new Error(
				'DATABASE_URL is not set. Copy .env.example to .env, or pass it through docker compose.'
			);
		}
		return value;
	},

	/**
	 * Keys the session-token HMAC. In production a real secret is mandatory:
	 * a known secret means anyone can mint a session row hash.
	 */
	get sessionSecret(): string {
		const value = process.env.SESSION_SECRET;

		if (value && value.length >= 32) return value;

		if (this.isProduction) {
			throw new Error(
				'SESSION_SECRET must be set to at least 32 characters in production. ' +
					'Generate one with: openssl rand -base64 48'
			);
		}
		if (value && value.length > 0) {
			throw new Error(
				`SESSION_SECRET is set but only ${value.length} characters; it needs at least 32.`
			);
		}
		return DEV_SESSION_SECRET;
	},

	get sessionTtlDays(): number {
		return int('SESSION_TTL_DAYS', 30);
	},

	/**
	 * Public origin. adapter-node also reads ORIGIN itself for CSRF origin
	 * checking; this is for absolute URLs and configuration warnings.
	 */
	get origin(): string | null {
		return process.env.ORIGIN ?? null;
	},

	get trustProxyHops(): number {
		return int('TRUST_PROXY_HOPS', 0);
	},

	get allowRegistration(): boolean {
		return bool('ALLOW_REGISTRATION', true);
	},

	/**
	 * Registrations allowed per client address per hour.
	 *
	 * Rate limiting keys on the client address, and a household behind one NAT
	 * looks like a single client — so a family setting up four accounts on a
	 * Sunday afternoon would otherwise trip an anti-abuse limit meant for the
	 * open internet. Raise it for a private instance; lower it for a public one.
	 */
	get registrationsPerHour(): number {
		return int('REGISTRATIONS_PER_HOUR', 10);
	},

	get port(): number {
		return int('PORT', 3000);
	}
};

/**
 * Called once at server startup. Forces every lazy getter so a misconfigured
 * container fails immediately and visibly, rather than on the first login
 * attempt three days later.
 */
export function assertConfig(): void {
	void env.databaseUrl;
	void env.sessionSecret;
	void env.sessionTtlDays;
	void env.trustProxyHops;
	void env.port;
}

/**
 * Non-fatal configuration warnings. These are settings that work but will bite:
 * fatal problems throw above.
 */
export function configWarnings(): string[] {
	const warnings: string[] = [];

	if (env.isProduction && !env.origin) {
		warnings.push(
			'ORIGIN is not set. Behind a reverse proxy, form posts will fail the CSRF origin check ' +
				'and generated absolute URLs will be wrong. Set ORIGIN to your public https URL.'
		);
	}
	if (env.isProduction && env.origin && !env.origin.startsWith('https://')) {
		warnings.push(
			`ORIGIN is "${env.origin}". Cookies are Secure in production and browsers will not send ` +
				'them over plain http, so login will appear to silently fail.'
		);
	}
	if (env.isProduction && env.trustProxyHops === 0) {
		warnings.push(
			'TRUST_PROXY_HOPS=0. If MotoSwipe sits behind Caddy/nginx, set it to 1 so rate limiting ' +
				'sees real client addresses instead of the proxy address.'
		);
	}
	if (!env.isProduction && process.env.SESSION_SECRET === undefined) {
		warnings.push(
			'SESSION_SECRET is not set; using the development default. Sessions are not secure.'
		);
	}
	return warnings;
}
