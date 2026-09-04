import { describe, expect, it } from 'vitest';
import { REJECTED_IMAGES, rejectedImage } from './curated';

describe('rejectedImage', () => {
	const vulcan =
		"Kawasaki_Vulcan_S_-_MRS_Oficina_-_Mondial_de_l'Automobile_de_Paris_2018_-_001.jpg";

	it('recognises a rejected file behind a thumbnail URL with tracking parameters', () => {
		const url = `https://thumb.wikimedia.org/wikipedia/commons/thumb/8/8a/${encodeURIComponent(vulcan)}/1280px-${encodeURIComponent(vulcan)}?utm_source=de.wikipedia.org`;
		expect(rejectedImage(url)?.reason).toMatch(/MRS Oficina/);
	});

	it('recognises the same file as an original upload and as a File: title', () => {
		expect(
			rejectedImage(
				`https://upload.wikimedia.org/wikipedia/commons/8/8a/${encodeURIComponent(vulcan)}`
			)
		).toBeDefined();
		expect(rejectedImage(`File:${vulcan.replace(/_/g, ' ')}`)).toBeDefined();
	});

	it('leaves every other photograph alone', () => {
		expect(
			rejectedImage(
				'https://thumb.wikimedia.org/wikipedia/commons/thumb/6/68/KawasakiVulcanS2020.jpg/1280px-KawasakiVulcanS2020.jpg'
			)
		).toBeUndefined();
	});

	it('every entry carries a reason', () => {
		for (const entry of REJECTED_IMAGES) {
			expect(entry.reason.length).toBeGreaterThan(20);
		}
	});
});
