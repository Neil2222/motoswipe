import type { Role } from '$lib/domain/enums';

/**
 * The authenticated principal attached to every request by `hooks.server.ts`.
 * Deliberately minimal: no password hash, no session token, nothing that must
 * not reach a `+page.svelte`.
 */
export interface SessionUser {
	id: string;
	email: string;
	username: string;
	displayName: string;
	role: Role;
}

declare global {
	namespace App {
		interface Error {
			message: string;
			/** Correlates a user-facing 500 with a server log line. */
			code?: string;
		}

		interface Locals {
			user: SessionUser | null;
			/** Session id, so `logout` can revoke exactly this session. */
			sessionId: string | null;
		}
	}
}

export {};
