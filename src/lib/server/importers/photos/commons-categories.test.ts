import { describe, expect, it } from 'vitest';
import {
	chooseFamilyCategory,
	isFamilyPhoto,
	isFamilySubcategory,
	placeFile,
	subcategoryYear,
	type CategoryFile
} from './commons-categories';

const z900 = {
	manufacturerName: 'Kawasaki',
	model: 'Z900',
	siblingModels: ['Z900RS', 'Z650', 'Z1000']
};

const file = (over: Partial<CategoryFile>): CategoryFile => ({
	title: 'File:Kawasaki Z900.jpg',
	url: 'https://upload.wikimedia.org/x.jpg',
	sourceUrl: null,
	width: 3000,
	height: 2000,
	description: '',
	takenOn: null,
	...over
});

const generations = [
	{ id: 'g1', from: 2017, to: 2019 },
	{ id: 'g2', from: 2020, to: 2024 },
	{ id: 'g3', from: 2025, to: 2026 }
];

describe('chooseFamilyCategory', () => {
	it('takes the category that is exactly the family', () => {
		expect(
			chooseFamilyCategory(
				['Category:Kawasaki Z900RS', 'Category:Kawasaki Z900', 'Category:Kawasaki Z 900'],
				z900
			)
		).toBe('Category:Kawasaki Z900');
		expect(
			chooseFamilyCategory(['Category:BMW S 1000 XR', 'Category:BMW M1000XR'], {
				manufacturerName: 'BMW',
				model: 'S 1000 XR'
			})
		).toBe('Category:BMW S 1000 XR');
	});

	it('accepts a bracketed code but never a relative', () => {
		expect(
			chooseFamilyCategory(['Category:Honda NC750X (RC90)'], {
				manufacturerName: 'Honda',
				model: 'NC750X'
			})
		).toBe('Category:Honda NC750X (RC90)');
		expect(chooseFamilyCategory(['Category:Kawasaki Z900RS'], z900)).toBeUndefined();
	});
});

describe('isFamilySubcategory', () => {
	it('keeps year and code subcategories, drops siblings and strangers', () => {
		expect(isFamilySubcategory('Category:Kawasaki Z900 (2020)', z900)).toBe(true);
		expect(isFamilySubcategory('Category:Kawasaki Z900 by year', z900)).toBe(true);
		expect(isFamilySubcategory('Category:Kawasaki Z900RS', z900)).toBe(false);
		expect(isFamilySubcategory('Category:Kawasaki Z1000', z900)).toBe(false);
		expect(isFamilySubcategory('Category:Kawasaki Z900 Cafe', z900)).toBe(false);
	});

	it('reads the year off a subcategory name', () => {
		expect(subcategoryYear('Category:Kawasaki Z900 (2020)', 2026)).toBe(2020);
		expect(subcategoryYear('Category:Kawasaki Z900 by year', 2026)).toBeUndefined();
	});
});

describe('isFamilyPhoto', () => {
	it('needs the file itself to name the model', () => {
		expect(isFamilyPhoto(file({ title: 'File:KawasakiZ900.jpg' }), z900)).toBe(true);
		expect(
			isFamilyPhoto(
				file({ title: 'File:IMG 4423.jpg', description: 'Kawasaki Z 900 at a show' }),
				z900
			)
		).toBe(true);
		// In the category, but a self-portrait with no mention of the bike.
		expect(
			isFamilyPhoto(
				file({ title: 'File:Hugo Fast.jpg', description: 'Self Portrait of a living legend' }),
				z900
			)
		).toBe(false);
	});

	it('refuses a relative, a detail and a thumbnail', () => {
		expect(isFamilyPhoto(file({ title: 'File:2018 Z900RS at a show.jpg' }), z900)).toBe(false);
		expect(isFamilyPhoto(file({ title: 'File:Kawasaki Z900 engine.jpg' }), z900)).toBe(false);
		expect(
			isFamilyPhoto(file({ title: 'File:Kawasaki Z900.jpg', width: 300, height: 200 }), z900)
		).toBe(false);
	});
});

describe('isFamilyPhoto with a shortened brand', () => {
	it("accepts the maker's first word inside the family category, and folds accents", () => {
		const glide = {
			manufacturerName: 'Harley-Davidson',
			model: 'Sport Glide',
			siblingModels: ['Street Glide', 'Road Glide']
		};
		expect(isFamilyPhoto(file({ title: 'File:Harley Sport Glide 2022.jpg' }), glide)).toBe(true);
		expect(isFamilyPhoto(file({ title: 'File:Sport Glide 2022.jpg' }), glide)).toBe(false);
		const tenere = { manufacturerName: 'Yamaha', model: 'Ténéré 700', siblingModels: [] };
		expect(isFamilyPhoto(file({ title: 'File:2022 Yamaha Tenere700.jpg' }), tenere)).toBe(true);
	});

	it('dates a category file whose title leaves the brand out', () => {
		const glide = { manufacturerName: 'Harley-Davidson', model: 'Sport Glide' };
		const placed = placeFile(
			file({ title: 'File:Harley Sport Glide 2022.jpg' }),
			glide,
			[{ id: 'g', from: 2018, to: 2025 }],
			2026
		);
		expect(placed).toMatchObject({ scope: 'MODEL_YEAR', generationId: 'g', year: 2022 });
	});
});

describe('placeFile', () => {
	it('places a stated year on its generation at model-year scope', () => {
		const placed = placeFile(
			file({ title: 'File:2021 Kawasaki Z900.jpg' }),
			z900,
			generations,
			2026
		);
		expect(placed).toMatchObject({ scope: 'MODEL_YEAR', generationId: 'g2', year: 2021 });
	});

	it('reads the year from the caption or the subcategory', () => {
		expect(
			placeFile(
				file({ title: 'File:DSC 1.jpg', description: 'Kawasaki Z900 (2025) in green' }),
				z900,
				generations,
				2026
			)
		).toMatchObject({ scope: 'MODEL_YEAR', generationId: 'g3', year: 2025 });
		expect(
			placeFile(
				file({ title: 'File:DSC 2.jpg', subcategory: 'Category:Kawasaki Z900 (2018)' }),
				z900,
				generations,
				2026
			)
		).toMatchObject({ scope: 'MODEL_YEAR', generationId: 'g1', year: 2018 });
	});

	it('lets a photograph date prove the first generation, and nothing later', () => {
		const early = placeFile(
			file({ title: 'File:Kawasaki Z900.jpg', takenOn: '2018-09-16 16:13:09' }),
			z900,
			generations,
			2026
		);
		expect(early).toMatchObject({ scope: 'GENERATION', generationId: 'g1' });
		expect((early as { evidence: string }).evidence).toContain('2020');

		const late = placeFile(
			file({ title: 'File:Kawasaki Z900.jpg', takenOn: '2023-05-01 10:00:00' }),
			z900,
			generations,
			2026
		);
		expect(late.scope).toBe('FAMILY');
	});

	it('gives an undivided family its photograph at generation scope', () => {
		const one = [{ id: 'only', from: 2017, to: 2026 }];
		expect(placeFile(file({}), z900, one, 2026)).toMatchObject({
			scope: 'GENERATION',
			generationId: 'only'
		});
	});
});
