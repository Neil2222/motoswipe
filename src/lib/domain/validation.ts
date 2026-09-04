import { z } from 'zod';
import { RoundFiltersSchema } from './filters';
import { RoundVisibility, SwipeDecision } from './enums';

/**
 * Every shape that crosses the network boundary is defined here and validated
 * on the server. Client-side validation, where present, is a convenience only —
 * the server never trusts it.
 */

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/**
 * 12 characters minimum with no composition rules. Length beats forced symbol
 * classes, which mostly produce `Password1!` and a note on a monitor.
 */
export const passwordSchema = z
	.string()
	.min(12, 'Use at least 12 characters')
	.max(200, 'That is longer than 200 characters');

export const emailSchema = z
	.string()
	.trim()
	.toLowerCase()
	.min(3)
	.max(254)
	.pipe(z.email('Enter a valid email address'));

export const usernameSchema = z
	.string()
	.trim()
	.toLowerCase()
	.min(3, 'At least 3 characters')
	.max(32, 'At most 32 characters')
	.regex(/^[a-z0-9_-]+$/, 'Letters, numbers, underscore and hyphen only');

/** Reserved because these will become `/users/<name>` routes later. */
const RESERVED_USERNAMES = new Set([
	'admin',
	'administrator',
	'api',
	'dashboard',
	'login',
	'logout',
	'register',
	'profile',
	'rounds',
	'round',
	'motorcycles',
	'motorcycle',
	'users',
	'user',
	'me',
	'settings',
	'about',
	'help',
	'support',
	'static',
	'assets',
	'img',
	'moto',
	'motoswipe',
	'root',
	'system',
	'null',
	'undefined'
]);

export const registerSchema = z.object({
	email: emailSchema,
	username: usernameSchema.refine((v) => !RESERVED_USERNAMES.has(v), 'That username is reserved'),
	displayName: z.string().trim().min(1, 'Tell us what to call you').max(60),
	password: passwordSchema
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
	// Login accepts an email or a username, so it is not parsed as an email here.
	identifier: z.string().trim().toLowerCase().min(1, 'Enter your email or username').max(254),
	password: z.string().min(1, 'Enter your password').max(200)
});
export type LoginInput = z.infer<typeof loginSchema>;

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

/**
 * Bounds are generous on purpose. They exist to reject typos and junk, not to
 * tell anyone their body is out of range.
 */
const nullableInt = (min: number, max: number, message: string) =>
	z
		.union([z.literal(''), z.coerce.number().int().min(min, message).max(max, message)])
		.transform((v) => (v === '' ? null : v))
		.nullable();

export const profileSchema = z.object({
	displayName: z.string().trim().min(1, 'Display name cannot be empty').max(60),
	heightCm: nullableInt(100, 250, 'Enter a height between 100 and 250 cm'),
	inseamCm: nullableInt(40, 130, 'Enter an inseam between 40 and 130 cm'),
	countryCode: z
		.union([z.literal(''), z.string().trim().length(2).toUpperCase()])
		.transform((v) => (v === '' ? null : v))
		.nullable(),
	preferredCurrency: z
		.union([z.literal(''), z.string().trim().length(3).toUpperCase()])
		.transform((v) => (v === '' ? null : v))
		.nullable()
});
export type ProfileInput = z.infer<typeof profileSchema>;

export const passwordChangeSchema = z
	.object({
		currentPassword: z.string().min(1, 'Enter your current password'),
		newPassword: passwordSchema,
		confirmPassword: z.string()
	})
	.refine((d) => d.newPassword === d.confirmPassword, {
		message: 'The two new passwords do not match',
		path: ['confirmPassword']
	});

// ---------------------------------------------------------------------------
// Rounds
// ---------------------------------------------------------------------------

export const roundCreateSchema = z.object({
	name: z.string().trim().min(1, 'Give the round a name').max(80),
	description: z
		.union([z.literal(''), z.string().trim().max(500)])
		.transform((v) => (v === '' ? null : v))
		.nullable()
		.optional(),
	goal: z
		.union([z.literal(''), z.string().trim().max(200)])
		.transform((v) => (v === '' ? null : v))
		.nullable()
		.optional(),
	visibility: z.enum(RoundVisibility).default('PRIVATE'),
	filters: RoundFiltersSchema.default({})
});
export type RoundCreateInput = z.infer<typeof roundCreateSchema>;

export const roundUpdateSchema = roundCreateSchema.partial();

export const roundDuplicateSchema = z.object({
	name: z.string().trim().min(1, 'Give the new round a name').max(80)
});

// ---------------------------------------------------------------------------
// Swiping & comparison
// ---------------------------------------------------------------------------

export const swipeSchema = z.object({
	motorcycleId: z.uuid(),
	decision: z.enum(SwipeDecision)
});
export type SwipeInput = z.infer<typeof swipeSchema>;

export const comparisonVoteSchema = z
	.object({
		motorcycleAId: z.uuid(),
		motorcycleBId: z.uuid(),
		winnerMotorcycleId: z.uuid()
	})
	.refine((d) => d.motorcycleAId !== d.motorcycleBId, {
		message: 'A motorcycle cannot be compared with itself',
		path: ['motorcycleBId']
	})
	.refine((d) => [d.motorcycleAId, d.motorcycleBId].includes(d.winnerMotorcycleId), {
		message: 'The winner must be one of the two motorcycles shown',
		path: ['winnerMotorcycleId']
	});
export type ComparisonVoteInput = z.infer<typeof comparisonVoteSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Form error map. `_` holds a message that belongs to the form as a whole
 * rather than to one field.
 */
export type FormErrors = Record<string, string>;

/** A whole-form error, e.g. "incorrect password". */
export function formError(message: string): FormErrors {
	return { _: message };
}

/** Flattens a ZodError into `{ field: firstMessage }` for form rendering. */
export function fieldErrors(error: z.ZodError): FormErrors {
	const out: FormErrors = {};
	for (const issue of error.issues) {
		const key = issue.path.length ? issue.path.join('.') : '_';
		if (!(key in out)) out[key] = issue.message;
	}
	return out;
}
