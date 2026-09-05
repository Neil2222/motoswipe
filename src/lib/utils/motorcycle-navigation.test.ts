import { describe, expect, it } from 'vitest';
import { motorcycleHref, motorcycleReturnTo } from './motorcycle-navigation';

describe('motorcycle return navigation', () => {
	it.each([
		'/motorcycles?q=Honda+CB&sort=year-desc&page=3',
		'/garage',
		'/admin/motorcycles?q=Honda&source=wikipedia&page=2',
		'/rounds/abc-123/swipe',
		'/rounds/abc-123/likes?decision=SUPERLIKE',
		'/rounds/abc-123/results',
		'/rounds/abc-123/compare'
	])('retains the source and filters: %s', (path) => {
		expect(motorcycleReturnTo(path)).toBe(path);
		const detail = new URL(motorcycleHref('bike-id', path), 'https://motoswipe.invalid');
		expect(detail.pathname).toBe('/motorcycles/bike-id');
		expect(detail.searchParams.get('returnTo')).toBe(path);
	});

	it.each([
		null,
		undefined,
		'',
		'https://example.com',
		'//example.com',
		'/\\example.com',
		'javascript:alert(1)',
		'/logout',
		'/api/rounds/abc/swipes',
		'/motorcycles/bike-id',
		'/motorcycles/../logout',
		'/motorcycles\n',
		'/motorcycles-malicious'
	])('falls back to the catalogue for an invalid destination: %s', (value) => {
		expect(motorcycleReturnTo(value)).toBe('/motorcycles');
	});
});
