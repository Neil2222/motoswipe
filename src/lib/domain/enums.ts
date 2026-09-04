/**
 * Domain enums, duplicated from the Prisma schema on purpose.
 *
 * The generated Prisma client lives under `$lib/server/`, which SvelteKit
 * refuses to import from client code — and rightly so. These plain const
 * objects give the browser the same values with no server coupling.
 *
 * `enums.sync.test.ts` asserts these stay identical to the generated enums, so
 * a schema change that is not mirrored here fails the test run rather than
 * silently drifting.
 */

export const Role = {
	USER: 'USER',
	ADMIN: 'ADMIN'
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const ProfileVisibility = {
	PRIVATE: 'PRIVATE',
	PUBLIC: 'PUBLIC'
} as const;
export type ProfileVisibility = (typeof ProfileVisibility)[keyof typeof ProfileVisibility];

export const RoundStatus = {
	DRAFT: 'DRAFT',
	ACTIVE: 'ACTIVE',
	COMPLETED: 'COMPLETED',
	ARCHIVED: 'ARCHIVED'
} as const;
export type RoundStatus = (typeof RoundStatus)[keyof typeof RoundStatus];

export const RoundVisibility = {
	PRIVATE: 'PRIVATE',
	UNLISTED: 'UNLISTED',
	PUBLIC: 'PUBLIC'
} as const;
export type RoundVisibility = (typeof RoundVisibility)[keyof typeof RoundVisibility];

export const SwipeDecision = {
	LIKE: 'LIKE',
	DISLIKE: 'DISLIKE',
	SUPERLIKE: 'SUPERLIKE',
	SKIP: 'SKIP'
} as const;
export type SwipeDecision = (typeof SwipeDecision)[keyof typeof SwipeDecision];

export const MotorcycleCategory = {
	NAKED: 'NAKED',
	HYPER_NAKED: 'HYPER_NAKED',
	SPORT: 'SPORT',
	SUPERSPORT: 'SUPERSPORT',
	CRUISER: 'CRUISER',
	BOBBER: 'BOBBER',
	TOURING: 'TOURING',
	SPORT_TOURING: 'SPORT_TOURING',
	ADVENTURE: 'ADVENTURE',
	DUAL_SPORT: 'DUAL_SPORT',
	SUPERMOTO: 'SUPERMOTO',
	CLASSIC: 'CLASSIC',
	CAFE_RACER: 'CAFE_RACER',
	SCRAMBLER: 'SCRAMBLER',
	SCOOTER: 'SCOOTER',
	OTHER: 'OTHER'
} as const;
export type MotorcycleCategory = (typeof MotorcycleCategory)[keyof typeof MotorcycleCategory];

export const RidingPosition = {
	UPRIGHT: 'UPRIGHT',
	SPORT_UPRIGHT: 'SPORT_UPRIGHT',
	AGGRESSIVE: 'AGGRESSIVE',
	FEET_FORWARD: 'FEET_FORWARD',
	UNKNOWN: 'UNKNOWN'
} as const;
export type RidingPosition = (typeof RidingPosition)[keyof typeof RidingPosition];

export const LicenseCategory = {
	AM: 'AM',
	A1: 'A1',
	A2: 'A2',
	A: 'A',
	UNKNOWN: 'UNKNOWN'
} as const;
export type LicenseCategory = (typeof LicenseCategory)[keyof typeof LicenseCategory];

/** Whether a round wants new bikes, used bikes, or does not care. */
export const ConditionScope = {
	NEW: 'NEW',
	USED: 'USED',
	BOTH: 'BOTH'
} as const;
export type ConditionScope = (typeof ConditionScope)[keyof typeof ConditionScope];

// ---------------------------------------------------------------------------
// Well-known tags
// ---------------------------------------------------------------------------

/**
 * Marks a machine you cannot realistically buy and ride on a road: a Grand
 * Prix prototype, a streamliner, a concept bike, a minibike, a military
 * half-track.
 *
 * Importers apply it; round filters exclude it by default. It lives here rather
 * than in the importer that happens to set it, because both sides need to agree
 * on the exact string and neither should own it.
 */
export const NON_ROAD_TAG = 'non-road';

// ---------------------------------------------------------------------------
// Display labels
// ---------------------------------------------------------------------------

export const CATEGORY_LABELS: Record<MotorcycleCategory, string> = {
	NAKED: 'Naked',
	HYPER_NAKED: 'Hyper Naked',
	SPORT: 'Sport',
	SUPERSPORT: 'Supersport',
	CRUISER: 'Cruiser',
	BOBBER: 'Bobber',
	TOURING: 'Touring',
	SPORT_TOURING: 'Sport Touring',
	ADVENTURE: 'Adventure',
	DUAL_SPORT: 'Dual Sport',
	SUPERMOTO: 'Supermoto',
	CLASSIC: 'Classic',
	CAFE_RACER: 'Café Racer',
	SCRAMBLER: 'Scrambler',
	SCOOTER: 'Scooter',
	OTHER: 'Other'
};

export const CATEGORY_ORDER: MotorcycleCategory[] = [
	'NAKED',
	'HYPER_NAKED',
	'SPORT',
	'SUPERSPORT',
	'SPORT_TOURING',
	'TOURING',
	'ADVENTURE',
	'DUAL_SPORT',
	'SUPERMOTO',
	'CRUISER',
	'BOBBER',
	'CLASSIC',
	'CAFE_RACER',
	'SCRAMBLER',
	'SCOOTER',
	'OTHER'
];

export const RIDING_POSITION_LABELS: Record<RidingPosition, string> = {
	UPRIGHT: 'Upright',
	SPORT_UPRIGHT: 'Sporty upright',
	AGGRESSIVE: 'Aggressive / forward',
	FEET_FORWARD: 'Feet forward',
	UNKNOWN: 'Unknown'
};

export const LICENSE_LABELS: Record<LicenseCategory, string> = {
	AM: 'AM (moped)',
	A1: 'A1 (125 cc)',
	A2: 'A2 (35 kW)',
	A: 'A (unrestricted)',
	UNKNOWN: 'Unknown'
};

export const DECISION_LABELS: Record<SwipeDecision, string> = {
	LIKE: 'Like',
	DISLIKE: 'Nope',
	SUPERLIKE: 'Superlike',
	SKIP: 'Skip'
};

export const ROUND_STATUS_LABELS: Record<RoundStatus, string> = {
	DRAFT: 'Draft',
	ACTIVE: 'Active',
	COMPLETED: 'Completed',
	ARCHIVED: 'Archived'
};
