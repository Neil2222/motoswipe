import { describe, expect, it } from 'vitest';
import { contributionsForSpan } from './rebuild';

const span = (from: number, to: number) => ({ from, to, source: 'CURATED' as const });

describe('contributionsForSpan', () => {
	const rdw = { source: 'rdw', eraFrom: 2013, eraTo: 2026 };
	const wiki = { source: 'wikipedia', eraFrom: 2014, eraTo: null };
	const maker = { source: 'manufacturer', eraFrom: 2026, eraTo: 2026 };
	const undated = { source: 'legacy', eraFrom: null, eraTo: null };

	it("keeps the maker's current page out of an earlier generation", () => {
		const own = contributionsForSpan([rdw, wiki, maker, undated], span(2016, 2020));
		expect(own.map((r) => r.source)).toEqual(['rdw', 'wikipedia', 'legacy']);
	});

	it('lets the maker describe the generation its model year falls in', () => {
		const own = contributionsForSpan([rdw, wiki, maker], span(2021, 2026));
		expect(own.map((r) => r.source)).toEqual(['rdw', 'wikipedia', 'manufacturer']);
	});

	it('treats an article still in production as open-ended', () => {
		expect(contributionsForSpan([wiki], span(2024, 2026))).toEqual([wiki]);
	});

	it('falls back to every record where nothing dated touches the span', () => {
		expect(contributionsForSpan([maker], span(2016, 2020))).toEqual([maker]);
	});
});
