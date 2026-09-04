/**
 * Domain errors.
 *
 * Services throw these; the HTTP layer (`guards.ts`, route handlers,
 * `hooks.server.ts`) translates them into status codes. Services stay unaware
 * of HTTP, which is what makes them straightforward to unit test.
 */

export class DomainError extends Error {
	readonly status: number;
	readonly code: string;
	/**
	 * Per-field messages, empty for errors that are not about a form. Declared on
	 * the base class so route handlers can read it without narrowing to a
	 * specific subclass first.
	 */
	readonly fields: Record<string, string>;

	constructor(
		message: string,
		status = 400,
		code = 'DOMAIN_ERROR',
		fields: Record<string, string> = {}
	) {
		super(message);
		this.name = new.target.name;
		this.status = status;
		this.code = code;
		this.fields = fields;
	}

	/** Field messages if there are any, otherwise the message as a form error. */
	toFormErrors(): Record<string, string> {
		return Object.keys(this.fields).length > 0 ? this.fields : { _: this.message };
	}
}

export class ValidationError extends DomainError {
	constructor(message = 'Some fields need fixing', fields: Record<string, string> = {}) {
		super(message, 422, 'VALIDATION_ERROR', fields);
	}
}

export class NotFoundError extends DomainError {
	constructor(what = 'That') {
		super(`${what} could not be found`, 404, 'NOT_FOUND');
	}
}

/** The caller is not signed in. */
export class UnauthorizedError extends DomainError {
	constructor(message = 'You need to sign in to do that') {
		super(message, 401, 'UNAUTHORIZED');
	}
}

/**
 * The caller is signed in but this is not theirs.
 *
 * Note: round lookups deliberately answer 404 rather than 403 so that guessing
 * a UUID cannot confirm whether a round exists.
 */
export class ForbiddenError extends DomainError {
	constructor(message = 'You do not have access to that') {
		super(message, 403, 'FORBIDDEN');
	}
}

export class ConflictError extends DomainError {
	constructor(message: string) {
		super(message, 409, 'CONFLICT');
	}
}

export class RateLimitError extends DomainError {
	readonly retryAfterSeconds: number;

	constructor(retryAfterSeconds: number, message = 'Too many attempts. Try again shortly.') {
		super(message, 429, 'RATE_LIMITED');
		this.retryAfterSeconds = retryAfterSeconds;
	}
}

export function isDomainError(e: unknown): e is DomainError {
	return e instanceof DomainError;
}
