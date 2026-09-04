import { describe, expect, it } from 'vitest';
import { browseHref, isBrowsingEverything, readBrowseQuery } from './browse';

/**
 * The browse query lives entirely in the URL, so that a search can be shared
 * and the back button does the obvious thing. These tests pin the round trip.
 */
describe('readBrowseQuery', () => {
	const read = (qs: string) => readBrowseQuery(new URLSearchParams(qs));

	it('reads a full query', () => {
		const query = read('q=z900&category=NAKED&yearFrom=2015&priceMax=20000&sort=cheapest&page=3');

		expect(query).toMatchObject({
			q: 'z900',
			category: 'NAKED',
			yearFrom: 2015,
			priceMax: 20000,
			sort: 'cheapest',
			page: 3
		});
	});

	it('hides photo-less motorcycles unless asked', () => {
		expect(read('').withPhotos).toBe(true);
		expect(read('withPhotos=false').withPhotos).toBe(false);
	});

	it('shows the catalogue rather than an error for a hand-edited URL', () => {
		// Somebody trimming a URL should not get a 500.
		expect(read('category=NOT_A_CATEGORY&page=zero')).toEqual({ withPhotos: true });
	});
});

describe('browseHref', () => {
	it('drops defaults so the URL stays readable', () => {
		expect(browseHref({ withPhotos: true })).toBe('/motorcycles');
		expect(browseHref({ withPhotos: true, sort: 'popular', page: 1 })).toBe('/motorcycles');
	});

	it('round-trips a query', () => {
		const query = readBrowseQuery(
			new URLSearchParams('q=africa+twin&category=ADVENTURE&priceMax=15000&page=2')
		);
		const href = browseHref(query);

		expect(readBrowseQuery(new URLSearchParams(href.split('?')[1]))).toEqual(query);
	});

	it('applies overrides on top', () => {
		const query = readBrowseQuery(new URLSearchParams('q=z900&page=4'));
		expect(browseHref(query, { page: 1 })).toBe('/motorcycles?q=z900');
	});
});

describe('isBrowsingEverything', () => {
	it('ignores sort and paging, which narrow nothing', () => {
		expect(isBrowsingEverything({ withPhotos: true, sort: 'newest', page: 5 })).toBe(true);
		expect(isBrowsingEverything({ withPhotos: true, q: 'z900' })).toBe(false);
	});
});
