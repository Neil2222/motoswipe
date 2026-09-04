import { describe, expect, it } from 'vitest';
import {
	buildSearchQuery,
	isPhotoOf,
	modelVariants,
	namesADifferentMotorcycle,
	rankCandidates,
	yearInTitle
} from './commons-match';

/**
 * Every title below is a genuine Commons search result for the bike named in
 * the test. The wrong ones are the reason this module exists: Commons search is
 * full-text, and a swipe app that shows the wrong motorcycle is not doing the
 * one thing it is for.
 */

const photo = (title: string, width = 2000, height = 1400) => ({ title, width, height });

describe('isPhotoOf', () => {
	const honda = { manufacturerName: 'Honda', model: 'NC750X' };

	it('accepts a photograph that names the bike', () => {
		expect(isPhotoOf(photo('File:2018 Honda NC750X (DSC 0785).jpg'), honda)).toBe(true);
		expect(isPhotoOf(photo('File:Honda NC750X.jpg'), honda)).toBe(true);
		expect(
			isPhotoOf(photo('File:Osaka Motor Show 2015 (211) - Honda NC750X (EBL-RC72).JPG'), honda)
		).toBe(true);
	});

	it('ignores spacing and punctuation the way the catalogue does', () => {
		const bmw = { manufacturerName: 'BMW Motorrad', model: 'R1250GS' };
		expect(isPhotoOf(photo('File:BMW R 1250 GS (1).jpg'), bmw)).toBe(true);
		expect(isPhotoOf(photo('File:BMW R1250GS HP 2018-10-12.jpg'), bmw)).toBe(true);
	});

	it('rejects a different model of the same brand', () => {
		const ninja = { manufacturerName: 'Kawasaki', model: 'Ninja 400' };
		expect(isPhotoOf(photo('File:Kawasaki Ninja 400.jpg'), ninja)).toBe(true);
		expect(isPhotoOf(photo('File:Kawasaki Ninja ZX-6R 2007 TMCS.jpg'), ninja)).toBe(false);

		const glide = { manufacturerName: 'Harley-Davidson', model: 'Street Glide' };
		expect(
			isPhotoOf(photo('File:Harley-Davidson Street Glide, Petrolia, Ontario.jpg'), glide)
		).toBe(true);
		expect(isPhotoOf(photo('File:Harley-Davidson Road Glide parked at Hogs.jpg'), glide)).toBe(
			false
		);
	});

	it('rejects a longer model whose name contains the one we asked for', () => {
		// The single most likely wrong answer, and invisible without the
		// catalogue: "Z900RS" contains "Z900", and it is a different motorcycle.
		const z900 = {
			manufacturerName: 'Kawasaki',
			model: 'Z900',
			siblingModels: ['Z900RS', 'Z650', 'Ninja 400']
		};
		expect(isPhotoOf(photo('File:Kawasaki Z900 2017.jpg'), z900)).toBe(true);
		expect(isPhotoOf(photo('File:Kawasaki Z900RS Cafe.jpg'), z900)).toBe(false);

		// And the sibling itself still matches its own photograph.
		expect(
			isPhotoOf(photo('File:Kawasaki Z900RS Cafe.jpg'), {
				manufacturerName: 'Kawasaki',
				model: 'Z900RS',
				siblingModels: ['Z900']
			})
		).toBe(true);
	});

	it('rejects photographs of a part rather than a motorcycle', () => {
		const dl650 = { manufacturerName: 'Suzuki', model: 'DL650' };
		expect(isPhotoOf(photo('File:Suzuki vstrom dl650 motorcycle.jpg'), dl650)).toBe(true);
		expect(isPhotoOf(photo('File:Suzuki DL650 2009 Indicator Lense.jpg'), dl650)).toBe(false);
		expect(isPhotoOf(photo('File:Suzuki DL650 engine.jpg'), dl650)).toBe(false);
		expect(isPhotoOf(photo('File:Suzuki DL650 dashboard.jpg'), dl650)).toBe(false);
	});

	it('rejects anything that is not a photograph', () => {
		const dl650 = { manufacturerName: 'Suzuki', model: 'DL650' };
		expect(isPhotoOf(photo('File:Suzuki DL650 logo.svg'), dl650)).toBe(false);
		expect(isPhotoOf(photo('File:Suzuki DL650 brochure.pdf'), dl650)).toBe(false);
	});

	it('rejects images too small or too oddly shaped to show a bike', () => {
		const dl650 = { manufacturerName: 'Suzuki', model: 'DL650' };
		expect(isPhotoOf(photo('File:Suzuki DL650.jpg', 320, 200), dl650)).toBe(false);
		expect(isPhotoOf(photo('File:Suzuki DL650.jpg', 3000, 300), dl650)).toBe(false);
		expect(isPhotoOf(photo('File:Suzuki DL650.jpg', 1600, 1200), dl650)).toBe(true);
	});

	it('rejects a title that does not name the brand at all', () => {
		expect(
			isPhotoOf(photo('File:V-Strom 650.jpg'), { manufacturerName: 'Suzuki', model: 'DL650' })
		).toBe(false);
	});
});

describe('rankCandidates', () => {
	it('puts the cleanest portrait first', () => {
		const context = { manufacturerName: 'Honda', model: 'NC750X' };
		const ranked = rankCandidates(
			[
				photo('File:Osaka Motor Show 2015 (211) - Honda NC750X (EBL-RC72).JPG'),
				photo('File:Honda NC750X.jpg'),
				photo('File:2018 Honda NC750X (DSC 0785).jpg')
			],
			context
		);

		expect(ranked[0].title).toBe('File:Honda NC750X.jpg');
	});
});

describe('buildSearchQuery', () => {
	it('names the machine and says what it is', () => {
		expect(buildSearchQuery('Honda', 'NC750X')).toBe('Honda NC750X motorcycle');
		expect(buildSearchQuery('BMW  ', ' R 1250 GS ')).toBe('BMW R 1250 GS motorcycle');
	});
});

describe('modelVariants', () => {
	it('searches the literal name first', () => {
		expect(modelVariants('Ninja 650')).toEqual(['Ninja 650']);
	});

	it('pulls the recognisable name out of the brackets', () => {
		// RDW files the Tracer 900 GT under a type code with the real name
		// appended; Commons has only ever heard of the real name.
		expect(modelVariants('MTT850D (TRACER900 GT)')).toEqual([
			'MTT850D (TRACER900 GT)',
			'TRACER900 GT',
			'MTT850D'
		]);
	});

	it('drops a trim marker no photographer puts in a filename', () => {
		expect(modelVariants('Z800 ABS')).toEqual(['Z800 ABS', 'Z800']);
		expect(modelVariants('NC750X DCT')).toEqual(['NC750X DCT', 'NC750X']);
	});

	it('never widens a name down to nothing', () => {
		expect(modelVariants('ABS')).toEqual(['ABS']);
	});
});

/**
 * An article's images are not all of its subject. These four files were on the
 * Kawasaki Z900's page and all four went into its gallery, so the card for a
 * Z900 showed a Honda CBR600RR.
 */
describe("vetting a Wikipedia article's own images", () => {
	const z900 = {
		manufacturerName: 'Kawasaki',
		model: 'Z900',
		siblingModels: ['Z900RS', 'Z650', 'Ninja 650']
	};

	it('keeps the photographs that are of this bike', () => {
		expect(isPhotoOf({ title: 'File:KawasakiZ900.jpg' }, z900)).toBe(true);
		expect(isPhotoOf({ title: 'File:Kawasaki Z900, green.jpg' }, z900)).toBe(true);
	});

	it('rejects another manufacturer entirely', () => {
		expect(isPhotoOf({ title: 'File:2006HondaCBR600RR-profile.png' }, z900)).toBe(false);
	});

	it('rejects the RS, which is a different motorcycle', () => {
		expect(isPhotoOf({ title: 'File:Kawasaki Z900 RS 2025 Eicma 2024.jpg' }, z900)).toBe(false);

		// ...and the RS still gets it.
		expect(
			isPhotoOf(
				{ title: 'File:Kawasaki Z900 RS 2025 Eicma 2024.jpg' },
				{ manufacturerName: 'Kawasaki', model: 'Z900RS', siblingModels: ['Z900'] }
			)
		).toBe(true);
	});
});

/**
 * The rebuild is the only place that knows every model in the catalogue, and
 * that turned out to matter: the Kawasaki Z900RS exists only in the registry's
 * data, so the Wikipedia provider could not know it was a different bike and
 * put its photograph on the Z900's card.
 */
describe('namesADifferentMotorcycle', () => {
	it('ignores registry rows named after the brand or a bare type code', () => {
		const context = {
			manufacturerName: 'Honda',
			model: 'VFR1200X Crosstourer',
			siblingModels: ['Honda', 'P', 'CB500X'],
			aliases: ['Crosstourer', 'VFR 1200 X']
		};
		expect(namesADifferentMotorcycle('File:Honda Crosstourer 2015.jpg', context)).toBe(false);
		expect(namesADifferentMotorcycle('File:Honda CrossTourer YM12 01738.jpg', context)).toBe(false);
		expect(namesADifferentMotorcycle('File:Honda CB500X 2019.jpg', context)).toBe(true);
	});

	it('counts a curated alias as naming this model', () => {
		const withAlias = {
			manufacturerName: 'Honda',
			model: 'VFR1200X Crosstourer',
			siblingModels: ['NC750X'],
			aliases: ['Crosstourer']
		};
		const without = { ...withAlias, aliases: [] };
		expect(namesADifferentMotorcycle('File:Honda Crosstourer and NC750X.jpg', withAlias)).toBe(
			false
		);
		expect(namesADifferentMotorcycle('File:Honda Crosstourer and NC750X.jpg', without)).toBe(true);
	});

	const z900 = {
		manufacturerName: 'Kawasaki',
		model: 'Z900',
		otherBrands: ['honda', 'yamaha', 'suzuki', 'ducati'],
		siblingModels: ['Z900RS', 'Ninja 650', 'Versys 650']
	};

	it('rejects a file that names another manufacturer', () => {
		expect(namesADifferentMotorcycle('File:2006HondaCBR600RR-profile.png', z900)).toBe(true);
	});

	it('rejects a longer model name that explains the file better', () => {
		expect(namesADifferentMotorcycle('File:Kawasaki Z900 RS 2025 Eicma 2024.jpg', z900)).toBe(true);
	});

	it('rejects an unrelated sibling', () => {
		expect(namesADifferentMotorcycle('File:Kawasaki Versys 650 in the alps.jpg', z900)).toBe(true);
	});

	it('keeps the bike we asked for', () => {
		expect(namesADifferentMotorcycle('File:KawasakiZ900.jpg', z900)).toBe(false);
		expect(namesADifferentMotorcycle('File:Kawasaki Z900, green.jpg', z900)).toBe(false);
	});

	it('keeps a curated lead image that names nothing', () => {
		// The reason this is not just `!isPhotoOf`. Editors name lead images
		// anything at all, and demanding proof would throw away good photographs.
		expect(namesADifferentMotorcycle('File:At the 2019 Tokyo show.jpg', z900)).toBe(false);
		expect(namesADifferentMotorcycle('File:DSC 0785.jpg', z900)).toBe(false);
	});

	it('does not reject on a brand that only appears as a fragment', () => {
		expect(
			namesADifferentMotorcycle('File:Kawasaki Z900 at Suzukawa station.jpg', {
				...z900,
				otherBrands: ['bmw', 'ktm']
			})
		).toBe(false);
	});
});

describe('yearInTitle', () => {
	const z900 = { manufacturerName: 'Kawasaki', model: 'Z900' };

	it('reads a year that sits beside the name', () => {
		expect(yearInTitle('File:2018 Kawasaki Z900.jpg', z900, 2026)).toBe(2018);
		expect(yearInTitle('File:Kawasaki Z900 2020.jpg', z900, 2026)).toBe(2020);
		expect(yearInTitle('File:Kawasaki Z900 (2025) front.jpg', z900, 2026)).toBe(2025);
		expect(yearInTitle('File:Kawasaki_Z900_2017_side.jpg', z900, 2026)).toBe(2017);
	});

	it('refuses a date, an event year and a year that is not next to the name', () => {
		expect(yearInTitle('File:Kawasaki Z900 2018-05-12.jpg', z900, 2026)).toBeUndefined();
		expect(yearInTitle('File:Kawasaki Z900 at EICMA 2017.jpg', z900, 2026)).toBeUndefined();
		expect(
			yearInTitle('File:Motorcycle show 2019 Kawasaki Z900 stand.jpg', z900, 2026)
		).toBeUndefined();
		expect(yearInTitle('File:Kawasaki Z900.jpg', z900, 2026)).toBeUndefined();
	});

	it('refuses a year from the future or the distant past', () => {
		expect(yearInTitle('File:Kawasaki Z900 2031.jpg', z900, 2026)).toBeUndefined();
		expect(yearInTitle('File:Kawasaki Z900 1900.jpg', z900, 2026)).toBeUndefined();
	});

	it('understands a spaced-out model name', () => {
		const gs = { manufacturerName: 'BMW', model: 'R 1250 GS' };
		expect(yearInTitle('File:BMW R 1250 GS 2019.jpg', gs, 2026)).toBe(2019);
		expect(yearInTitle('File:2021 BMW R1250GS.jpg', gs, 2026)).toBe(2021);
	});

	it('reads a model year the file states in so many words', () => {
		const sdr = { manufacturerName: 'KTM', model: '1290 Super Duke R' };
		expect(yearInTitle('File:KTM_1290_Super_Duke_R_Special_Edition_MY_2016.jpg', sdr, 2026)).toBe(
			2016
		);
		const vstrom = { manufacturerName: 'Suzuki', model: 'V-Strom 650' };
		expect(yearInTitle('File:Suzuki_V-Strom_650_XT_MY2018.jpg', vstrom, 2026)).toBe(2018);
		const zx10 = { manufacturerName: 'Kawasaki', model: 'Ninja ZX-10R' };
		expect(yearInTitle('File:Kawasaki_Ninja_ZX-10_R_Modelljahr_2024.jpg', zx10, 2026)).toBe(2024);
		const rt = { manufacturerName: 'BMW', model: 'R 1250 RT' };
		expect(
			yearInTitle('File:Stockach (BMW R1250 RT, Bj. 2020 oder 2021, Schriftzug) 2021.jpg', rt, 2026)
		).toBeUndefined();
	});

	it('reads a year between the brand and the model, or after a colour', () => {
		const rt = { manufacturerName: 'BMW', model: 'R 1200 RT' };
		expect(yearInTitle('File:BMW_2010_R1200RT_Special.jpg', rt, 2026)).toBe(2010);
		expect(yearInTitle('File:Alpine_white_2017_BMW_R1200RT.jpg', rt, 2026)).toBe(2017);
		const vstrom = { manufacturerName: 'Suzuki', model: 'V-Strom 650' };
		expect(yearInTitle('File:Red_2005_Suzuki_V-Strom_650.jpg', vstrom, 2026)).toBe(2005);
		expect(
			yearInTitle('File:Motorcycle show 2019 Suzuki V-Strom 650 stand.jpg', vstrom, 2026)
		).toBeUndefined();
		expect(
			yearInTitle('File:Paris - Salon de la moto 2011 - Suzuki - V-Strom 650.jpg', vstrom, 2026)
		).toBeUndefined();
	});

	it('steps over a code or capacity after the name, but not a word', () => {
		const xadv = { manufacturerName: 'Honda', model: 'X-ADV' };
		expect(yearInTitle('File:Honda_X-ADV_750_2025.jpg', xadv, 2026)).toBe(2025);
		const mt07 = { manufacturerName: 'Yamaha', model: 'MT-07' };
		expect(yearInTitle('File:Yamaha_MT-07_Moto_Cage,_2015.jpg', mt07, 2026)).toBeUndefined();
		const cb = { manufacturerName: 'Honda', model: 'CB650R' };
		expect(yearInTitle('File:Honda_CB650R_Motorcycle_2021.jpg', cb, 2026)).toBeUndefined();
		expect(
			yearInTitle(
				'File:Honda_CBR600RR_(VX24_USM)_-_25_April_2026.jpg',
				{ manufacturerName: 'Honda', model: 'CBR600RR' },
				2026
			)
		).toBeUndefined();
		// "at the" is not a code: the year after it is the show's, the one in
		// front is the machine's.
		const drz = { manufacturerName: 'Suzuki', model: 'DR-Z400' };
		expect(
			yearInTitle(
				'File:2010_Suzuki_DRZ400_at_the_2009_Seattle_International_Motorcycle_Show_2.jpg',
				drz,
				2026
			)
		).toBe(2010);
	});

	it('refuses an event year after the name, a museum visit and a comma-dated caption', () => {
		const scrambler = { manufacturerName: 'Ducati', model: 'Scrambler 800' };
		expect(
			yearInTitle('File:Ducati_Scrambler_800_-_EICMA_2024.jpg', scrambler, 2026)
		).toBeUndefined();
		const trk = { manufacturerName: 'Benelli', model: 'TRK 502' };
		expect(yearInTitle('File:Benelli_TRK_502_EICMA_2024_noBG.jpg', trk, 2026)).toBeUndefined();
		const lowRider = { manufacturerName: 'Harley-Davidson', model: 'Low Rider ST' };
		expect(
			yearInTitle(
				'File:Harley-Davidson_Museum_May_2024_28_(2024_Low_Rider_ST).jpg',
				lowRider,
				2026,
				{ brandImplied: true }
			)
		).toBeUndefined();
		const niken = { manufacturerName: 'Yamaha', model: 'Niken' };
		expect(yearInTitle('File:Paris-Nice_2021,_Yamaha_Niken_(1).jpg', niken, 2026)).toBeUndefined();
		const roadmaster = { manufacturerName: 'Indian', model: 'Roadmaster' };
		expect(yearInTitle('File:Indian_Roadmaster,_2015_(1).jpg', roadmaster, 2026)).toBeUndefined();
		const nineT = { manufacturerName: 'BMW', model: 'R nineT' };
		expect(yearInTitle('File:BMW_R_nineT_IAA_2019_JM_0256.jpg', nineT, 2026)).toBeUndefined();
		const glide = { manufacturerName: 'Harley-Davidson', model: 'Road Glide Special' };
		expect(
			yearInTitle('File:Moscow,_2023_Harley-Davidson_Road_Glide_Special.jpg', glide, 2026)
		).toBeUndefined();
	});

	it('reads a two-token brand and a code with a digit after the name', () => {
		const glide = { manufacturerName: 'Harley-Davidson', model: 'Street Glide' };
		expect(yearInTitle('File:Harley_Davidson_Street_Glide_2015_panel.jpg', glide, 2026)).toBe(2015);
		const r3 = { manufacturerName: 'Yamaha', model: 'YZF-R3' };
		expect(yearInTitle('File:Yamaha_YZF-R3_2022_v1.jpg', r3, 2026)).toBe(2022);
		const veloce = { manufacturerName: 'MV Agusta', model: 'Turismo Veloce' };
		expect(yearInTitle('File:MV_Agusta_Turismo_Veloce_800_HMT_2015.jpg', veloce, 2026)).toBe(2015);
	});

	it('stops at a month or a comma between the name and a year', () => {
		const thruxton = { manufacturerName: 'Triumph', model: 'Thruxton' };
		expect(
			yearInTitle('File:Moscow,_Triumph_Thruxton,_May_2026_01.jpg', thruxton, 2026)
		).toBeUndefined();
		expect(yearInTitle('File:Triumph_Thruxton_May_2026.jpg', thruxton, 2026)).toBeUndefined();
		expect(yearInTitle('File:Triumph_Thruxton_2019,_Moscow.jpg', thruxton, 2026)).toBe(2019);
	});

	it('accepts a title without the brand only where the brand is implied', () => {
		const mt09 = { manufacturerName: 'Yamaha', model: 'MT-09' };
		expect(yearInTitle('File:MT_09_RN43_2017.jpg', mt09, 2026)).toBeUndefined();
		expect(yearInTitle('File:MT_09_RN43_2017.jpg', mt09, 2026, { brandImplied: true })).toBe(2017);
		expect(
			yearInTitle(
				'File:Blue_2006_YZFR6.jpg',
				{ manufacturerName: 'Yamaha', model: 'YZF-R6' },
				2026,
				{ brandImplied: true }
			)
		).toBe(2006);
	});
});
