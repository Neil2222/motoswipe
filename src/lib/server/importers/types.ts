import type { LicenseCategory, MotorcycleCategory, RidingPosition } from '$lib/domain/enums';

/**
 * The provider contract.
 *
 * Every external data source — a manufacturer site, a specs database, a CSV
 * somebody emailed you — implements this interface and nothing else in the
 * application changes. Providers are responsible for fetching and for mapping
 * their own vocabulary onto MotoSwipe's; `ImportService` owns everything about
 * the database.
 *
 * The split matters because scraping is fragile and legally awkward, while the
 * application is neither. Keeping fetch logic behind this boundary means a
 * provider can be deleted, rate-limited, or replaced without touching a route.
 */

/**
 * A motorcycle in MotoSwipe's vocabulary but not yet persisted.
 *
 * Every specification is optional, on purpose. External sources are patchy and
 * a null is honest; a guessed value is not. `NormalizedMotorcycle` should only
 * ever contain what the source actually stated.
 */
export interface NormalizedMotorcycle {
	// -- Identity -------------------------------------------------------------
	manufacturerName: string;
	manufacturerCountryCode?: string | null;
	manufacturerWebsite?: string | null;

	model: string;
	variant?: string | null;
	modelYear?: number | null;

	category: MotorcycleCategory;
	/** The source's own category string, preserved verbatim. */
	categoryRaw?: string | null;
	subCategory?: string | null;
	tags?: string[];
	description?: string | null;

	// -- Engine ---------------------------------------------------------------
	displacementCc?: number | null;
	cylinders?: number | null;
	engineConfiguration?: string | null;
	cooling?: string | null;
	powerHp?: number | null;
	powerKw?: number | null;
	torqueNm?: number | null;
	transmission?: string | null;
	gears?: number | null;

	// -- Physical -------------------------------------------------------------
	wetWeightKg?: number | null;
	dryWeightKg?: number | null;
	seatHeightMm?: number | null;
	seatWidthMm?: number | null;
	wheelbaseMm?: number | null;
	fuelCapacityLiters?: number | null;

	// -- Usage ----------------------------------------------------------------
	passengerAllowed?: boolean | null;
	seatCount?: number | null;
	passengerPegs?: boolean | null;
	ridingPosition?: RidingPosition | null;
	licenseCategory?: LicenseCategory | null;

	// -- Commercial -----------------------------------------------------------
	msrpAmount?: number | null;
	msrpCurrency?: string | null;
	marketCountryCode?: string | null;
	availableNew?: boolean | null;

	/** Years the model was actually being registered new. See the schema. */
	firstRegistrationYear?: number | null;
	lastRegistrationYear?: number | null;
	registrationCount?: number | null;

	/**
	 * The same figures per model year, where the source can break them down.
	 *
	 * Only a registry can: it knows each machine's first registration date, so
	 * it can say what a 2019 example weighed and cost against a 2021 one. This
	 * is the evidence generations are built from — see `catalog/boundaries.ts`.
	 */
	modelYears?: ModelYearObservation[];

	// -- Provenance -----------------------------------------------------------
	/** Stable id within the source. Together with `source` it identifies a row. */
	externalId: string;

	/**
	 * The era this record describes — production years where the source knows
	 * them, otherwise the span over which examples were registered.
	 *
	 * This is what stops a 1976 Kawasaki Z650 and a 2017 one becoming one
	 * motorcycle. See `catalog/identity.ts`.
	 */
	eraFrom?: number | null;
	eraTo?: number | null;

	/**
	 * How sure the provider is about individual fields, 0–1.
	 *
	 * Absent fields are treated as ordinarily reliable. Say something here when
	 * a figure is weaker than it looks: RDW's engine power is sampled from
	 * whichever examples happen to be registered, so it must never displace a
	 * published specification.
	 */
	confidence?: Partial<Record<string, number>>;
	sourceUrl?: string | null;

	images?: NormalizedImage[];
}

/** One model year of one model, as a source observed it. */
export interface ModelYearObservation {
	year: number;
	registrationCount: number;
	medianPriceEur?: number | null;
	medianMassKg?: number | null;
	medianDisplacementCc?: number | null;
	/** The highest rated power sampled that year, in kW. See the RDW provider. */
	maxPowerKw?: number | null;
}

export interface NormalizedImage {
	url: string;
	sourceUrl?: string | null;
	isPrimary?: boolean;
	sortOrder?: number;
	width?: number | null;
	height?: number | null;
	imageType?: string | null;
	/**
	 * Licence or credit line. A provider that cannot supply one should not be
	 * emitting the image — see README, "Image strategy".
	 */
	attribution?: string | null;
	/** The model year the image is known to show, when the source states it. */
	modelYear?: number | null;
	/** What proves the scope, in one checkable line. */
	evidence?: string | null;
	/** `cc` (attribution, may be self-hosted) or `manufacturer` (hotlink only). */
	license?: string | null;
}

/** A provider's raw payload before normalisation. Shape is provider-private. */
export type RawMotorcycle = unknown;

export interface ListOptions {
	/** Cap on records to walk. Providers should honour it to keep dev runs fast. */
	limit?: number;
	/** Only records changed since this instant, where the source supports it. */
	since?: Date;
}

export interface ProviderListing {
	externalId: string;
	/** Enough to log meaningfully before the record is fetched. */
	label: string;
	sourceUrl?: string | null;
}

export interface MotorcycleProvider {
	/** Stable identifier, stored on every row this provider creates. */
	readonly source: string;
	readonly displayName: string;
	/**
	 * Whether this provider reaches the network. The import command refuses to
	 * run network providers unless explicitly allowed, so a `db:seed` on a NAS
	 * never quietly starts scraping.
	 */
	readonly requiresNetwork: boolean;

	/**
	 * When true, a record whose normalised make and model already exist in the
	 * catalogue enriches that row instead of creating a second one.
	 *
	 * Set it on any source that describes the same machines another source
	 * already covers — a registry and an encyclopedia both know about the
	 * Kawasaki Z900, and without this the swipe deck shows it twice.
	 */
	readonly mergeByModelName?: boolean;

	/** Enumerates available records without fetching each one in full. */
	listMotorcycles(options?: ListOptions): Promise<ProviderListing[]>;

	/** Fetches one record in the source's own format. */
	fetchMotorcycle(externalId: string): Promise<RawMotorcycle>;

	/**
	 * Maps a raw record onto MotoSwipe's model. Pure where possible — this is
	 * the part worth unit-testing against a saved fixture.
	 *
	 * Return null to skip a record that cannot be mapped honestly.
	 */
	normalizeMotorcycle(raw: RawMotorcycle): NormalizedMotorcycle | null;
}

export interface ImportResult {
	source: string;
	created: number;
	updated: number;
	/**
	 * Records that filled gaps in a motorcycle another source already
	 * contributed, instead of creating a duplicate row. Only ever non-zero for
	 * providers that declare `mergeByModelName`.
	 */
	enriched: number;
	skipped: number;
	/** Rows left alone because a human had edited them. */
	protectedRows: number;
	failed: { externalId: string; reason: string }[];
	/**
	 * Every id the source listed this run, so `retireMissing` can be called
	 * without asking the provider to enumerate itself a second time. For a
	 * network source that second pass is a second full download.
	 */
	seenExternalIds: string[];
	/** What rebuilding the canonical catalogue from every source record did. */
	rebuild?: import('../catalog/rebuild').RebuildResult;
	durationMs: number;
}

export interface ImportOptions {
	limit?: number;
	since?: Date;
	/** Report what would change without writing. */
	dryRun?: boolean;
	/**
	 * Overwrite fields on rows marked `manuallyEdited`. Off by default —
	 * a human correction outranks a scraper.
	 */
	overwriteManualEdits?: boolean;
	/**
	 * Skip rebuilding the canonical catalogue afterwards. For running several
	 * providers back to back and rebuilding once at the end.
	 */
	skipRebuild?: boolean;
	onProgress?: (done: number, total: number, label: string) => void;
}
