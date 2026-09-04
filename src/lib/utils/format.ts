/**
 * Display formatting.
 *
 * The governing rule: a missing specification renders as an em dash, never as
 * "0", "N/A" or a guess. The catalogue is honest about gaps and the UI has to
 * be too.
 */

export const EMPTY = '—';

export function num(value: number | null | undefined, digits = 0): string {
	if (value === null || value === undefined || !Number.isFinite(value)) return EMPTY;
	return value.toLocaleString('en-GB', {
		minimumFractionDigits: digits,
		maximumFractionDigits: digits
	});
}

export function unit(value: number | null | undefined, suffix: string, digits = 0): string {
	if (value === null || value === undefined || !Number.isFinite(value)) return EMPTY;
	return `${num(value, digits)} ${suffix}`;
}

export function money(
	amount: number | null | undefined,
	currency: string | null | undefined
): string {
	if (amount === null || amount === undefined || !Number.isFinite(amount)) return EMPTY;
	if (!currency) return num(amount);

	try {
		return new Intl.NumberFormat('en-GB', {
			style: 'currency',
			currency,
			maximumFractionDigits: 0
		}).format(amount);
	} catch {
		// Unknown ISO code from an importer: show it rather than throwing.
		return `${currency} ${num(amount)}`;
	}
}

/**
 * Years are identifiers, not quantities: "2,026" is wrong. Rounds an averaged
 * year to the nearest whole one.
 */
export function year(value: number | null | undefined): string {
	if (value === null || value === undefined || !Number.isFinite(value)) return EMPTY;
	return String(Math.round(value));
}

export function percent(ratio: number | null | undefined, digits = 0): string {
	if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return EMPTY;
	return `${(ratio * 100).toFixed(digits)}%`;
}

/** "Kawasaki Z900 SE" — variant appended only when there is one. */
export function bikeName(bike: {
	manufacturer?: { name: string } | null;
	model: string;
	variant?: string | null;
}): string {
	return [bike.manufacturer?.name, bike.model, bike.variant].filter(Boolean).join(' ');
}

/** Power in both units, because riders use both. */
export function power(hp: number | null | undefined, kw: number | null | undefined): string {
	if (hp && kw) return `${num(hp, 0)} hp · ${num(kw, 0)} kW`;
	if (hp) return `${num(hp, 0)} hp`;
	if (kw) return `${num(kw, 0)} kW`;
	return EMPTY;
}

/** Wet where known, otherwise dry with an explicit label. */
export function weight(wetKg: number | null | undefined, dryKg: number | null | undefined): string {
	if (wetKg) return `${num(wetKg, 0)} kg wet`;
	if (dryKg) return `${num(dryKg, 0)} kg dry`;
	return EMPTY;
}

export function relativeTime(date: Date | string): string {
	const then = typeof date === 'string' ? new Date(date) : date;
	const seconds = Math.round((Date.now() - then.getTime()) / 1000);

	if (seconds < 60) return 'just now';
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return `${minutes} min ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours} h ago`;
	const days = Math.round(hours / 24);
	if (days < 7) return `${days} d ago`;
	if (days < 30) return `${Math.round(days / 7)} w ago`;
	if (days < 365) return `${Math.round(days / 30)} mo ago`;
	return `${Math.round(days / 365)} y ago`;
}

export function shortDate(date: Date | string): string {
	const d = typeof date === 'string' ? new Date(date) : date;
	return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Clamps to 0..1 and returns a CSS percentage, for progress bars. */
export function progressWidth(done: number, total: number): string {
	if (total <= 0) return '0%';
	return `${Math.min(100, Math.max(0, (done / total) * 100)).toFixed(2)}%`;
}

/**
 * Builds a `?a=b&c=d` string from plain values, skipping empty ones.
 *
 * Deliberately not `URLSearchParams`: an instance of that held in a component
 * is mutable state Svelte cannot track, and these are one-shot href builders.
 */
export function queryString(params: Record<string, string | number | null | undefined>): string {
	const parts: string[] = [];
	for (const [key, value] of Object.entries(params)) {
		if (value === null || value === undefined || value === '') continue;
		parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
	}
	return parts.length ? `?${parts.join('&')}` : '';
}
