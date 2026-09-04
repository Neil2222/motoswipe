import type { MotorcycleCategory } from '$lib/domain/enums';

/**
 * Facts about motorcycles that no algorithm can derive.
 *
 * The identity system in `identity.ts` handles everything that follows a rule:
 * spacing, punctuation, corporate suffixes, "ABS" and "DCT", generations that
 * do not overlap in time. This file is for the rest — the cases where knowing
 * the answer requires knowing about motorcycles.
 *
 * Two kinds of thing live here:
 *
 *  - **Aliases.** A vehicle registry files the Yamaha MT-07 as `MTN690` and the
 *    Suzuki GSX-8S as `GSX800`. There is no string operation that turns one
 *    into the other; the connection is a fact about the world. Same for the
 *    single-letter type codes — `NC750XA` is an NC750X, but stripping trailing
 *    letters in general would fold the Honda CB1000R into the CB1000, which is
 *    a different motorcycle.
 *
 *  - **Categories.** Guessing a category from a model name gets the obvious
 *    ones right and is confidently wrong about the rest: "Ninja" is not always
 *    a supersport, and CFMOTO's "MT" means Multi Terrain. A curated category
 *    always beats a guess.
 *
 * Deliberately data, not code. Adding a motorcycle here is adding a row, and
 * everything is keyed by the normalised brand so "CFMOTO", "CF Moto" and
 * "CF-Moto" all find it.
 */

export interface CuratedModel {
	/** Normalised brand key, as produced by `normalizeBrand`. */
	brand: string;
	/** The name this machine should be known by. */
	canonical: string;
	/**
	 * Other names sources use for the same machine. Matched after the same
	 * normalisation the canonical name gets, so spacing and case do not matter.
	 */
	aliases?: string[];
	/**
	 * Registry type codes this machine is filed under, matched as a prefix of
	 * the first word of a model name with any letter suffix ignored: `MTN690`
	 * claims "MTN690-U (MT-07)" and "MTN690-A", but not "MTN6901". Longest
	 * code wins, so `CB1000R` takes "CB1000RA" before `CB1000` can.
	 */
	typeCodes?: string[];
	/** Overrides any inferred category. */
	category?: MotorcycleCategory;
	/**
	 * The generation this entry describes, where a name spans several.
	 * A record whose era falls outside this window is a different motorcycle.
	 */
	yearFrom?: number;
	yearTo?: number;
	/** Why this entry exists, for whoever reads it next. */
	note?: string;
}

export const CURATED: CuratedModel[] = [
	// --- Yamaha: the registry files these under internal type codes ----------
	{
		brand: 'yamaha',
		canonical: 'MT-07',
		typeCodes: ['MTN690', 'MT07'],
		aliases: ['MTN690', 'MTN690-A', 'MT07A', 'MT07', 'MT07A (MT-07', 'MTN690-U (MT-07)'],
		category: 'NAKED',
		yearFrom: 2014,
		note: 'RDW type code MTN690. Not the MT-07 Tracer, which is its own machine.'
	},
	{
		brand: 'yamaha',
		canonical: 'MT-09',
		typeCodes: ['MTN850', 'MTN890', 'MT09'],
		aliases: [
			'MTN890',
			'MTN890-A',
			'MTN850',
			'MT09A',
			'MT09',
			'MTN850-A (MT-09',
			'MTN850D (MT-09SP)',
			'MT-09 SP'
		],
		category: 'NAKED',
		yearFrom: 2013
	},
	{
		brand: 'yamaha',
		canonical: 'Tracer 9',
		typeCodes: ['MTT850', 'MTT890'],
		aliases: [
			'MTT890D',
			'MTT890',
			'MTT890D-A',
			'MTT890D-K',
			'MTT890D-SK',
			'TRACER9 GT',
			'Tracer 9 GT',
			'Tracer 900',
			'Tracer 900 GT',
			'MTT850D',
			'MTT850'
		],
		category: 'SPORT_TOURING',
		yearFrom: 2015,
		note: 'Tracer 900 and Tracer 9 are the same continuous machine, renamed in 2021.'
	},
	{
		brand: 'yamaha',
		canonical: 'Tracer 7',
		typeCodes: ['MTT690'],
		aliases: [
			'MTT690',
			'MTT690-A',
			'Tracer 700',
			'MT-07 Tracer',
			'Tracer 7 GT',
			'Tracer 700 GT',
			'MTT690-U (tracer 700 35 KW)'
		],
		category: 'SPORT_TOURING',
		yearFrom: 2016
	},
	{
		brand: 'yamaha',
		canonical: 'Ténéré 700',
		typeCodes: ['XTZ690'],
		aliases: ['Tenere 700', 'XTZ690', 'XTZ690D', 'XTZ690-B', 'XTZ690D-B', 'XT700Z'],
		category: 'ADVENTURE',
		yearFrom: 2019
	},
	{
		brand: 'yamaha',
		canonical: 'MT-09 Tracer',
		aliases: [
			'MTT9TRA',
			'MT09TRA',
			'MT09TRA (MT-09 Tracer)',
			'MT09TRA(MT-09 Tracer)',
			'MT-09 Tracer ABS'
		],
		category: 'SPORT_TOURING',
		yearFrom: 2015,
		yearTo: 2020,
		note: 'The Tracer that predates the Tracer 9 name, and not the MT-09 itself.'
	},
	{
		brand: 'yamaha',
		canonical: 'XSR700',
		typeCodes: ['MTM690'],
		aliases: ['RM12', 'XSR700A'],
		category: 'CLASSIC'
	},
	{
		brand: 'yamaha',
		canonical: 'TMAX',
		typeCodes: ['XP500', 'XP530', 'XP560'],
		aliases: ['XP530', 'XP530D-A', 'XP560', 'T-MAX', 'TMAX 560', 'TMAX 530', 'T-MAX 560'],
		category: 'SCOOTER'
	},

	// --- Suzuki --------------------------------------------------------------
	{
		brand: 'suzuki',
		canonical: 'GSX-8S',
		typeCodes: ['GSX800'],
		aliases: ['GSX800', 'GSX800U', 'GSX-8S ABS'],
		category: 'NAKED',
		yearFrom: 2023,
		note: 'RDW files the 8S as GSX800; the 8R and V-Strom 800 share the engine but not the name.'
	},
	{
		brand: 'suzuki',
		canonical: 'GSX-8R',
		typeCodes: ['GSX800T'],
		aliases: ['GSX800T', 'GSX800TU'],
		category: 'SPORT',
		yearFrom: 2024
	},
	{
		brand: 'suzuki',
		canonical: 'V-Strom 800DE',
		typeCodes: ['DL800'],
		aliases: [
			'DL800',
			'DL800U',
			'DL800DE',
			'V-Strom 800 DE',
			'V-Strom 800',
			'V-Strom 800 RE',
			'V-Strom 800RE'
		],
		category: 'ADVENTURE',
		yearFrom: 2023
	},
	{
		brand: 'suzuki',
		canonical: 'V-Strom 650',
		typeCodes: ['DL650'],
		aliases: [
			'DL650',
			'DL650A',
			'DL650AUE',
			'DL650XA',
			'V-Strom',
			'V-Strom 650 XT',
			'V-Strom 650XT'
		],
		category: 'ADVENTURE'
	},
	{
		brand: 'suzuki',
		canonical: 'V-Strom 1000',
		typeCodes: ['DL1000'],
		aliases: ['DL1000', 'DL1000A', 'V-Strom 1000 XT'],
		category: 'ADVENTURE'
	},

	// --- Honda ---------------------------------------------------------------
	{
		brand: 'honda',
		canonical: 'NC750X',
		typeCodes: ['NC750X'],
		aliases: ['NC750XA', 'NC750XD', 'NC750XAD', 'RC90', 'RH09'],
		category: 'ADVENTURE',
		yearFrom: 2014,
		note: 'The D suffix is the dual-clutch version — same motorcycle, different gearbox.'
	},
	{
		brand: 'honda',
		canonical: 'CB750 Hornet',
		// RDW files it as CB750A — 866 registrations from 2023. Era keeps it away
		// from the 1969 CB750, which is a different motorcycle with the same name.
		typeCodes: ['CB750A'],
		aliases: ['CB750A', 'CB750AC', 'CB750A Hornet', 'CB750 HORNET', 'RH12', 'Hornet 750'],
		category: 'NAKED',
		yearFrom: 2023,
		note: 'Nothing to do with the 1969 CB750, which is a different motorcycle entirely.'
	},
	{
		brand: 'honda',
		canonical: 'CB1000 Hornet',
		typeCodes: ['CB1000', 'CB1000SP', 'CB1000J'],
		aliases: [
			'CB1000 HORNET',
			'Hornet 1000',
			'CB1000J',
			'CB1000',
			'CB 1000',
			'CB1000 Hornet SP',
			'CB1000SP'
		],
		category: 'HYPER_NAKED',
		yearFrom: 2024
	},
	{
		brand: 'honda',
		canonical: 'CRF1100L Africa Twin',
		typeCodes: ['CRF1100A', 'CRF1100D', 'CRF1100L'],
		aliases: ['CRF1100L', 'CRF1100D', 'CRF1100A', 'Africa Twin CRF1100L', 'SD10', 'Africa Twin'],
		category: 'ADVENTURE',
		yearFrom: 2020,
		note: 'The CRF1000L (2016-2019) and the XRV750 (1990-2003) are earlier, separate machines.'
	},
	{
		brand: 'honda',
		canonical: 'CRF1000L Africa Twin',
		typeCodes: ['CRF1000A', 'CRF1000D', 'CRF1000L'],
		aliases: ['CRF1000L', 'SD06'],
		category: 'ADVENTURE',
		yearFrom: 2016,
		yearTo: 2019
	},
	{
		brand: 'honda',
		canonical: 'CB500X',
		typeCodes: ['CB500X'],
		aliases: ['CB500XA', 'PC46'],
		category: 'ADVENTURE'
	},
	{
		brand: 'honda',
		canonical: 'CB650R',
		typeCodes: ['CB650R'],
		aliases: ['CB650RA'],
		category: 'NAKED'
	},
	{
		brand: 'honda',
		canonical: 'CBR650R',
		typeCodes: ['CBR650R'],
		aliases: ['CBR650RA'],
		category: 'SPORT'
	},
	{
		brand: 'honda',
		canonical: 'X-ADV',
		typeCodes: ['ADV750'],
		aliases: ['ADV750', 'XADV', 'RC95', 'X-ADV 750'],
		category: 'SCOOTER'
	},

	// --- Kawasaki ------------------------------------------------------------
	{
		brand: 'kawasaki',
		canonical: 'Z900',
		typeCodes: ['ZR900B', 'ZR900F', 'ZR900'],
		aliases: ['Z900 ABS', 'ZR900B', 'ZR900', 'Z900 SE', 'Z 900'],
		category: 'NAKED',
		yearFrom: 2017,
		note: 'The 1972 Z1/Z900 is a different motorcycle; the modern one starts in 2017.'
	},
	{
		brand: 'kawasaki',
		canonical: 'Z900RS',
		typeCodes: ['ZR900C', 'ZR900K'],
		aliases: ['Z900 RS', 'ZR900C', 'Z900RS SE', 'Z900RS Cafe', 'Z900 RS Cafe'],
		category: 'CLASSIC',
		yearFrom: 2018
	},
	{
		brand: 'kawasaki',
		canonical: 'Z650',
		typeCodes: ['ER650'],
		aliases: ['Z650 ABS', 'ER650', 'ER650K', 'Z 650'],
		category: 'NAKED',
		yearFrom: 2017,
		note: 'The 1976-1983 Z650 shares only the name.'
	},
	{
		brand: 'kawasaki',
		canonical: 'Z650RS',
		aliases: ['Z650 RS'],
		category: 'CLASSIC',
		yearFrom: 2022
	},
	{
		brand: 'kawasaki',
		canonical: 'Ninja 650',
		aliases: ['Ninja 650 ABS', 'EX650', 'ER-6f', 'ER6F'],
		category: 'SPORT',
		yearFrom: 2006,
		note: 'A sport tourer with a fairing, not a supersport — the name misleads the classifier.'
	},
	{
		brand: 'kawasaki',
		canonical: 'Ninja 400',
		typeCodes: ['EX400'],
		aliases: ['EX400'],
		category: 'SPORT'
	},
	{
		brand: 'kawasaki',
		canonical: 'Ninja ZX-6R',
		aliases: ['ZX600', 'ZX636'],
		category: 'SUPERSPORT'
	},
	{ brand: 'kawasaki', canonical: 'Ninja ZX-10R', aliases: ['ZX1000'], category: 'SUPERSPORT' },
	{
		brand: 'kawasaki',
		canonical: 'Versys 650',
		typeCodes: ['KLE650'],
		aliases: ['Versys 650 ABS', 'KLE650', 'Versys'],
		category: 'SPORT_TOURING'
	},
	{
		brand: 'kawasaki',
		canonical: 'Versys 1000',
		typeCodes: ['KLZ1000'],
		aliases: ['KLZ1000', 'Versys 1000 SE', 'Versys 1000 S'],
		category: 'SPORT_TOURING'
	},
	{ brand: 'kawasaki', canonical: 'Z800', aliases: ['Z800 ABS', 'ZR800'], category: 'NAKED' },
	{ brand: 'kawasaki', canonical: 'Z750', aliases: ['Z750 ABS', 'ZR750'], category: 'NAKED' },
	{
		brand: 'kawasaki',
		canonical: 'Z1000',
		aliases: ['Z1000 ABS', 'ZR1000'],
		category: 'HYPER_NAKED'
	},
	{
		brand: 'kawasaki',
		canonical: 'Vulcan S',
		typeCodes: ['EN650'],
		aliases: ['EN650'],
		category: 'CRUISER'
	},

	// --- BMW -----------------------------------------------------------------
	{
		brand: 'bmw',
		canonical: 'R 1300 GS',
		aliases: ['R1300GS'],
		category: 'ADVENTURE',
		yearFrom: 2023
	},
	{
		brand: 'bmw',
		canonical: 'R 1300 GS Adventure',
		aliases: ['R1300GSA', 'R1300GS Adventure'],
		category: 'ADVENTURE',
		yearFrom: 2024
	},
	{
		brand: 'bmw',
		canonical: 'R 1250 GS',
		aliases: ['R1250GS'],
		category: 'ADVENTURE',
		yearFrom: 2019
	},
	{
		brand: 'bmw',
		canonical: 'R 1250 GS Adventure',
		aliases: ['R1250GSA', 'R1250GS Adventure'],
		category: 'ADVENTURE',
		yearFrom: 2019
	},
	{
		brand: 'bmw',
		canonical: 'R 1200 GS',
		aliases: ['R1200GS'],
		category: 'ADVENTURE',
		yearFrom: 2004,
		yearTo: 2018
	},
	{
		brand: 'bmw',
		canonical: 'R 1200 GS Adventure',
		aliases: ['R1200GSA', 'R1200GS Adventure', 'R1200GSADVENTURE'],
		category: 'ADVENTURE'
	},
	{
		brand: 'bmw',
		canonical: 'F 900 GS',
		aliases: ['F900GS'],
		category: 'ADVENTURE',
		yearFrom: 2024
	},
	{ brand: 'bmw', canonical: 'F 850 GS', aliases: ['F850GS'], category: 'ADVENTURE' },
	{ brand: 'bmw', canonical: 'F 800 GS', aliases: ['F800GS'], category: 'ADVENTURE' },
	{
		brand: 'bmw',
		canonical: 'S 1000 RR',
		aliases: ['S1000RR'],
		category: 'SUPERSPORT',
		yearFrom: 2009
	},
	{ brand: 'bmw', canonical: 'S 1000 R', aliases: ['S1000R'], category: 'HYPER_NAKED' },
	{ brand: 'bmw', canonical: 'S 1000 XR', aliases: ['S1000XR'], category: 'SPORT_TOURING' },
	{ brand: 'bmw', canonical: 'R 1250 RT', aliases: ['R1250RT'], category: 'TOURING' },
	{ brand: 'bmw', canonical: 'R 1200 RT', aliases: ['R1200RT'], category: 'TOURING' },

	// --- Triumph -------------------------------------------------------------
	{
		brand: 'triumph',
		canonical: 'Street Triple 765',
		aliases: [
			'Street Triple 765 RS',
			'Street Triple 765 R',
			'Street Triple 765 RX',
			'Street Triple RS',
			'Street Triple R 765'
		],
		category: 'NAKED',
		yearFrom: 2017,
		note: 'The 675 Street Triple (2007-2016) is a separate generation, not a variant.'
	},
	{
		brand: 'triumph',
		canonical: 'Street Triple 675',
		// Not "Street Triple R": the registry uses that spelling for the 765 R
		// as well, so it forms its own family and the engine change divides it.
		aliases: ['Street Triple RX', 'Street Triple 675 R'],
		category: 'NAKED',
		yearFrom: 2007,
		yearTo: 2016
	},
	{
		brand: 'triumph',
		canonical: 'Tiger 900',
		aliases: ['Tiger 900 GT', 'Tiger 900 Rally'],
		category: 'ADVENTURE',
		yearFrom: 2020
	},
	{
		brand: 'triumph',
		canonical: 'Trident 660',
		aliases: ['Trident'],
		category: 'NAKED',
		yearFrom: 2021
	},

	// --- CFMOTO: "MT" is Multi Terrain, which the name classifier cannot know -
	{
		brand: 'cfmoto',
		canonical: '450MT',
		aliases: ['MT450', '450 MT'],
		category: 'ADVENTURE',
		yearFrom: 2024
	},
	{
		brand: 'cfmoto',
		canonical: '800MT',
		aliases: ['MT800', '800 MT', '800MT-X', '800MT-ES', '800MT Explore'],
		category: 'ADVENTURE',
		yearFrom: 2021
	},
	{ brand: 'cfmoto', canonical: '700MT', aliases: ['MT700', '700 MT'], category: 'ADVENTURE' },
	{ brand: 'cfmoto', canonical: '450NK', aliases: ['NK450'], category: 'NAKED' },
	{ brand: 'cfmoto', canonical: '700CL-X', aliases: ['CLX700', '700CLX'], category: 'SCRAMBLER' },

	// --- Aprilia / Ducati / KTM ----------------------------------------------
	{ brand: 'aprilia', canonical: 'RS 660', aliases: ['RS660'], category: 'SPORT', yearFrom: 2020 },
	{
		brand: 'aprilia',
		canonical: 'Tuono 660',
		aliases: ['Tuono660'],
		category: 'NAKED',
		yearFrom: 2021
	},
	{
		brand: 'ducati',
		canonical: 'Multistrada V4',
		aliases: ['Multistrada V4 S'],
		category: 'ADVENTURE',
		yearFrom: 2021
	},
	{
		brand: 'ktm',
		canonical: '390 Duke',
		aliases: ['Duke 390', '390 Duke (32 KW)', '390 Duke (30 KW)', '390 Duke (24 KW)'],
		category: 'NAKED'
	},
	{
		brand: 'ktm',
		canonical: '125 Duke',
		aliases: ['125 Duke (115)', '125DUKE', 'Duke 125', '125 Duke (11 KW)'],
		category: 'NAKED'
	},
	{ brand: 'ktm', canonical: '790 Duke', aliases: ['Duke 790'], category: 'NAKED' },
	{ brand: 'ktm', canonical: '890 Duke', aliases: ['Duke 890', '890 Duke R'], category: 'NAKED' },
	{
		brand: 'ktm',
		canonical: '1290 Super Duke R',
		aliases: ['Super Duke 1290', 'KTM 1290 Super Duke R'],
		category: 'HYPER_NAKED'
	},
	{
		brand: 'ktm',
		canonical: '1290 Super Adventure S',
		aliases: ['KTM 1290 Super Adventure S'],
		category: 'ADVENTURE'
	},

	// =========================================================================
	// The current market, by registry type code.
	//
	// Everything from here down came out of one review of every model with
	// sixty or more registrations since 2020. The registry files most of the
	// Japanese range under factory type codes — MTN890D is a Yamaha MT-09 SP,
	// CB1000RA a Honda CB1000R with ABS — and the same code is spelled a dozen
	// ways with suffixes for ABS, A2 restriction and colour. `typeCodes`
	// matches the code itself and ignores the suffix; see `identity.ts`.
	// =========================================================================

	// --- Yamaha type codes: MTN = MT naked, MTT = Tracer, MTM = XSR, YZF = R -
	{
		brand: 'yamaha',
		canonical: 'MT-10',
		typeCodes: ['MTN1000', 'MT10'],
		aliases: ['MT10', 'MT-10 SP', 'MTN1000D (MT-10 SP)'],
		category: 'HYPER_NAKED',
		yearFrom: 2016,
		note: 'The SP is the same motorcycle with Öhlins suspension.'
	},
	{
		brand: 'yamaha',
		canonical: 'MT-03',
		typeCodes: ['MTN320', 'MT03'],
		category: 'NAKED',
		yearFrom: 2016
	},
	{
		brand: 'yamaha',
		canonical: 'MT-125',
		typeCodes: ['MTN125', 'MT125'],
		aliases: ['MT125'],
		category: 'NAKED'
	},
	{
		brand: 'yamaha',
		canonical: 'XSR900',
		typeCodes: ['MTM850', 'MTM890'],
		aliases: ['MTM850(XSR900)', 'XSR900A', 'XSR 900', 'XSR900 GP'],
		category: 'CLASSIC',
		yearFrom: 2016,
		note: 'MTM850 is the 847 cc original, MTM890 the 890 cc redesign of 2022.'
	},
	{ brand: 'yamaha', canonical: 'XSR125', typeCodes: ['MTM125'], category: 'CLASSIC' },
	{
		brand: 'yamaha',
		canonical: 'YZF-R1',
		typeCodes: ['YZF1000', 'YZFR1'],
		aliases: ['YZF-R1', 'YZF R1', 'R1', 'YZF-R1M', 'YZF1000 (YZF-R1)'],
		category: 'SUPERSPORT'
	},
	{
		brand: 'yamaha',
		canonical: 'YZF-R7',
		typeCodes: ['YZF690'],
		aliases: ['YZF-R7', 'R7'],
		category: 'SPORT',
		yearFrom: 2021,
		note: 'The 1999 YZF-R7 was a 750 cc homologation special; this is the 689 cc twin.'
	},
	{
		brand: 'yamaha',
		canonical: 'YZF-R9',
		typeCodes: ['YZF890'],
		aliases: ['YZF-R9', 'R9'],
		category: 'SPORT',
		yearFrom: 2025
	},
	{
		brand: 'yamaha',
		canonical: 'YZF-R3',
		typeCodes: ['YZF320', 'YZFR3'],
		aliases: ['YZF-R3', 'YZF-R3A (YZF-R3)', 'YZF320-A (YZF-R3)', 'YZF-R3A', 'R3'],
		category: 'SPORT',
		yearFrom: 2015
	},
	{
		brand: 'yamaha',
		canonical: 'YZF-R125',
		typeCodes: ['YZF125', 'YZFR125'],
		aliases: ['YZF-R125', 'YZF125-A', 'R125'],
		category: 'SPORT'
	},
	{
		brand: 'yamaha',
		canonical: 'YZF-R6',
		typeCodes: ['YZF600', 'YZFR6'],
		aliases: ['YZF-R6', 'R6'],
		category: 'SUPERSPORT'
	},
	{
		brand: 'yamaha',
		canonical: 'FJR1300',
		typeCodes: ['FJR1300'],
		aliases: ['FJR-1300', 'FJR 1300', 'FJR1300A', 'FJR1300AE', 'FJR1300AS'],
		category: 'SPORT_TOURING'
	},
	{
		brand: 'yamaha',
		canonical: 'Super Ténéré 1200',
		typeCodes: ['XT1200'],
		aliases: [
			'XT1200Z',
			'XT1200ZE',
			'XT1200ZE (XT1200ZE Super Tenere)',
			'Super Tenere 1200',
			'XT1200Z Super Ténéré',
			'Super Ténéré'
		],
		category: 'ADVENTURE',
		yearFrom: 2010
	},
	{ brand: 'yamaha', canonical: 'SCR950', typeCodes: ['XVS950XR'], category: 'SCRAMBLER' },
	{
		brand: 'yamaha',
		canonical: 'X-MAX 300',
		typeCodes: ['CZD300'],
		aliases: ['X-MAX 300', 'XMAX 300', 'XMAX300', 'CZD300-A (X-MAX300)'],
		category: 'SCOOTER'
	},
	{
		brand: 'yamaha',
		canonical: 'X-MAX 400',
		typeCodes: ['YP400'],
		aliases: ['X-MAX 400', 'XMAX 400', 'XMAX400'],
		category: 'SCOOTER'
	},
	{
		brand: 'yamaha',
		canonical: 'NMAX 155',
		typeCodes: ['GPD150', 'GPD155'],
		aliases: ['GPD150-A (NMAX155)', 'NMAX155', 'N-MAX 155'],
		category: 'SCOOTER'
	},
	{
		brand: 'yamaha',
		canonical: 'NMAX 125',
		typeCodes: ['GPD125'],
		aliases: ['GPD-125-A (nmax)', 'NMAX125', 'N-MAX 125', 'NMAX'],
		category: 'SCOOTER'
	},

	// --- Honda: a trailing A is ABS, D is dual-clutch, AC/AE a gearbox option --
	{
		brand: 'honda',
		canonical: 'CB1000R',
		typeCodes: ['CB1000R'],
		aliases: ['CB1000RA', 'CB1000R+', 'CB1000R Black Edition', 'CB 1000 R'],
		category: 'NAKED',
		yearFrom: 2008,
		note: 'Not the CB1000 Hornet, which replaced it in 2025 under a different code.'
	},
	{
		brand: 'honda',
		canonical: 'CMX500 Rebel',
		typeCodes: ['CMX500'],
		aliases: ['CMX500A2', 'Rebel 500', 'CMX 500', 'Rebel'],
		category: 'CRUISER',
		yearFrom: 2017
	},
	{
		brand: 'honda',
		canonical: 'CMX1100 Rebel',
		typeCodes: ['CMX1100'],
		aliases: ['CMX1100A2', 'CMX1100D2', 'Rebel 1100', 'CMX 1100', 'Rebel 1100T'],
		category: 'CRUISER',
		yearFrom: 2021
	},
	{ brand: 'honda', canonical: 'CB500F', typeCodes: ['CB500F'], category: 'NAKED', yearFrom: 2013 },
	{
		brand: 'honda',
		canonical: 'CBR500R',
		typeCodes: ['CBR500R'],
		category: 'SPORT',
		yearFrom: 2013
	},
	{ brand: 'honda', canonical: 'CB650F', typeCodes: ['CB650F'], category: 'NAKED', yearFrom: 2014 },
	{
		brand: 'honda',
		canonical: 'CBR650F',
		typeCodes: ['CBR650F'],
		category: 'SPORT',
		yearFrom: 2014
	},
	{
		brand: 'honda',
		canonical: 'CB600F Hornet',
		typeCodes: ['CB600F'],
		aliases: ['Hornet 600', 'CB600F', 'CB 600 F', 'CB600F Hornet'],
		category: 'NAKED'
	},
	{
		brand: 'honda',
		canonical: 'CRF1000L Africa Twin Adventure Sports',
		aliases: [
			'CRF1000A2',
			'CRF1000D2',
			'CRF1000L Adventure Sports',
			'Africa Twin Adventure Sports',
			'CRF1000L Africa Twin Adventure Sports'
		],
		category: 'ADVENTURE',
		yearFrom: 2018,
		yearTo: 2019,
		note: 'Bigger tank, taller, different seat: a model in its own right, not a trim.'
	},
	{
		brand: 'honda',
		canonical: 'CRF1100L Africa Twin Adventure Sports',
		aliases: [
			'CRF1100A2',
			'CRF1100D2',
			'CRF1100A4',
			'CRF1100D4',
			'CRF1100L Adventure Sports',
			'CRF1100L Africa Twin Adventure Sports'
		],
		category: 'ADVENTURE',
		yearFrom: 2020,
		note: 'A2/D2 are the Adventure Sports, A4/D4 the Adventure Sports ES with electronic suspension.'
	},
	{
		brand: 'honda',
		canonical: 'SH300i',
		typeCodes: ['SH300'],
		aliases: ['SH 300'],
		category: 'SCOOTER'
	},
	{
		brand: 'honda',
		canonical: 'SH350i',
		typeCodes: ['SH350'],
		category: 'SCOOTER',
		yearFrom: 2021
	},
	{ brand: 'honda', canonical: 'SH150i', typeCodes: ['SH150'], category: 'SCOOTER' },
	{ brand: 'honda', canonical: 'SH125i', typeCodes: ['SH125'], category: 'SCOOTER' },
	{ brand: 'honda', canonical: 'NC750S', typeCodes: ['NC750S'], category: 'NAKED', yearFrom: 2014 },
	{
		brand: 'honda',
		canonical: 'Integra 750',
		typeCodes: ['NC750D'],
		aliases: ['Integra', 'NC750D Integra'],
		category: 'SCOOTER',
		yearFrom: 2014
	},
	{
		brand: 'honda',
		canonical: 'VFR800X Crossrunner',
		typeCodes: ['VFR800X'],
		aliases: ['VFR 800 X', 'Crossrunner', 'VFR800X'],
		category: 'SPORT_TOURING'
	},
	{
		brand: 'honda',
		canonical: 'VFR1200X Crosstourer',
		typeCodes: ['VFR1200X'],
		aliases: ['Crosstourer', 'VFR1200XD', 'VFR 1200 X'],
		category: 'ADVENTURE'
	},
	{
		brand: 'honda',
		canonical: 'VFR800',
		typeCodes: ['VFR800F', 'VFR800'],
		aliases: ['VFR 800', 'VFR800F', 'VFR800 FI', 'VFR800 VTEC'],
		category: 'SPORT_TOURING'
	},
	{
		brand: 'honda',
		canonical: 'Monkey 125',
		typeCodes: ['Z125M'],
		aliases: ['Monkey', 'Z125MA'],
		category: 'CLASSIC',
		yearFrom: 2018
	},
	{
		brand: 'honda',
		canonical: 'Gold Wing',
		typeCodes: ['GL1800'],
		aliases: ['Goldwing', 'GL1800 Gold Wing', 'GL 1800', 'Gold Wing Tour', 'GL1800DA', 'GL1800BD'],
		category: 'TOURING'
	},
	{
		brand: 'honda',
		canonical: 'ADV350',
		typeCodes: ['ADV350'],
		category: 'SCOOTER',
		yearFrom: 2022
	},
	{
		brand: 'honda',
		canonical: 'Forza 350',
		typeCodes: ['NSS350'],
		category: 'SCOOTER',
		yearFrom: 2021
	},
	{
		brand: 'honda',
		canonical: 'Forza 300',
		typeCodes: ['NSS300'],
		category: 'SCOOTER',
		yearFrom: 2013
	},
	{
		brand: 'honda',
		canonical: 'Forza 750',
		typeCodes: ['NSS750'],
		category: 'SCOOTER',
		yearFrom: 2021
	},
	{ brand: 'honda', canonical: 'Forza 125', typeCodes: ['NSS125'], category: 'SCOOTER' },
	{
		brand: 'honda',
		canonical: 'NT1100',
		typeCodes: ['NT1100'],
		aliases: ['NT 1100'],
		category: 'SPORT_TOURING',
		yearFrom: 2022
	},
	{
		brand: 'honda',
		canonical: 'CBR1000RR Fireblade',
		typeCodes: ['CBR1000R', 'CBR1000S'],
		aliases: [
			'CBR1000RA',
			'Fireblade',
			'CBR 1000 RR',
			'CBR1000RR',
			'CBR1000RR SP',
			'CBR1000RR-R',
			'CBR1000RR-R SP',
			'CBR1000RR-R Fireblade'
		],
		category: 'SUPERSPORT',
		yearFrom: 2004
	},
	{
		brand: 'honda',
		canonical: 'CBR600RR',
		typeCodes: ['CBR600R'],
		aliases: ['CBR600RA', 'CBR600R3', 'CBR 600 RR', 'CBR600RR'],
		category: 'SUPERSPORT'
	},
	{
		brand: 'honda',
		canonical: 'MSX125 Grom',
		typeCodes: ['MSX125'],
		aliases: ['Grom', 'MSX 125', 'MSX125A'],
		category: 'NAKED'
	},
	{
		brand: 'honda',
		canonical: 'PCX125',
		typeCodes: ['WW125'],
		aliases: ['PCX 125', 'PCX125A', 'WW125A', 'PCX'],
		category: 'SCOOTER'
	},
	{
		brand: 'honda',
		canonical: 'CRF300L',
		typeCodes: ['CRF300L'],
		category: 'DUAL_SPORT',
		yearFrom: 2021
	},
	{
		brand: 'honda',
		canonical: 'CRF300 Rally',
		typeCodes: ['CRF300LR'],
		aliases: ['CRF300LRA', 'CRF300 Rally'],
		category: 'DUAL_SPORT',
		yearFrom: 2021
	},
	{ brand: 'honda', canonical: 'CRF250L', typeCodes: ['CRF250L'], category: 'DUAL_SPORT' },
	{
		brand: 'honda',
		canonical: 'CRF250 Rally',
		typeCodes: ['CRF250RL'],
		aliases: ['CRF250RLA', 'CRF250 Rally'],
		category: 'DUAL_SPORT'
	},
	{ brand: 'honda', canonical: 'CBF125', typeCodes: ['CBF125M'], category: 'NAKED' },
	{
		brand: 'honda',
		canonical: 'CB125F',
		typeCodes: ['CBF125N'],
		aliases: ['CBF125NA', 'CB 125 F'],
		category: 'NAKED',
		yearFrom: 2015
	},
	{
		brand: 'honda',
		canonical: 'CB300R',
		typeCodes: ['CBF300N'],
		aliases: ['CBF300NA', 'CB 300 R'],
		category: 'NAKED',
		yearFrom: 2018
	},
	{
		brand: 'honda',
		canonical: 'Super Cub C125',
		typeCodes: ['C125'],
		aliases: ['Super Cub', 'C125A', 'Supercub'],
		category: 'CLASSIC'
	},
	{
		brand: 'honda',
		canonical: 'Dax 125',
		typeCodes: ['ST125'],
		aliases: ['Dax', 'ST125A'],
		category: 'CLASSIC'
	},
	{ brand: 'honda', canonical: 'Vision 110', typeCodes: ['NSC110'], category: 'SCOOTER' },
	{
		brand: 'honda',
		canonical: 'CL500',
		typeCodes: ['CL500'],
		category: 'SCRAMBLER',
		yearFrom: 2023
	},
	{
		brand: 'honda',
		canonical: 'XL750 Transalp',
		typeCodes: ['XL750'],
		aliases: ['Transalp', 'Transalp 750', 'XL750C', 'XL750 Transalp'],
		category: 'ADVENTURE',
		yearFrom: 2023,
		note: 'The XL600V/XL650V/XL700V Transalps of 1987-2013 are earlier machines.'
	},
	{ brand: 'honda', canonical: 'GB350S', typeCodes: ['GB350'], category: 'CLASSIC' },

	// --- Suzuki --------------------------------------------------------------
	{
		brand: 'suzuki',
		canonical: 'Burgman 400',
		typeCodes: ['AN400'],
		aliases: ['Burgman 400', 'AN 400'],
		category: 'SCOOTER'
	},
	{ brand: 'suzuki', canonical: 'Burgman 650', typeCodes: ['AN650'], category: 'SCOOTER' },
	{ brand: 'suzuki', canonical: 'Burgman 200', typeCodes: ['UH200'], category: 'SCOOTER' },
	{ brand: 'suzuki', canonical: 'Burgman 125', typeCodes: ['UH125'], category: 'SCOOTER' },
	{
		brand: 'suzuki',
		canonical: 'Hayabusa',
		typeCodes: ['GSX1300R'],
		aliases: ['GSX 1300R', 'GSX-R1300', 'GSX1300R Hayabusa', 'GSX 1300 R', 'GSX-1300R'],
		category: 'SPORT'
	},
	{
		brand: 'suzuki',
		canonical: 'V-Strom 1050',
		typeCodes: ['DL1050'],
		aliases: ['V-Strom 1050', 'V-Strom 1050 XT', 'V-Strom 1050DE', 'V-Strom 1050 DE', 'DL1050 XT'],
		category: 'ADVENTURE',
		yearFrom: 2020
	},
	{
		brand: 'suzuki',
		canonical: 'GSX-S1000',
		typeCodes: ['GSXS1000'],
		aliases: ['GSX-S 1000', 'GSXS1000'],
		category: 'NAKED',
		yearFrom: 2015
	},
	{
		brand: 'suzuki',
		canonical: 'GSX-S1000GT',
		typeCodes: ['GSXS1000T'],
		aliases: ['GSX-S1000GT', 'GSX-S 1000 GT'],
		category: 'SPORT_TOURING',
		yearFrom: 2022
	},
	{
		brand: 'suzuki',
		canonical: 'GSX-S1000GX',
		typeCodes: ['GSXS1000X'],
		aliases: ['GSX-S1000GX', 'GSX-S 1000 GX'],
		category: 'SPORT_TOURING',
		yearFrom: 2024
	},
	{
		brand: 'suzuki',
		canonical: 'GSX-S1000F',
		typeCodes: ['GSXS1000F'],
		aliases: ['GSX-S1000F', 'GSX-S 1000 F'],
		category: 'SPORT_TOURING',
		yearFrom: 2015,
		yearTo: 2021
	},
	{
		brand: 'suzuki',
		canonical: 'Katana',
		typeCodes: ['GSXS1000S'],
		aliases: ['GSX-S1000S', 'GSX-S1000S Katana', 'Katana 1000'],
		category: 'NAKED',
		yearFrom: 2019
	},
	{
		brand: 'suzuki',
		canonical: 'GSX-S950',
		typeCodes: ['GSXS950'],
		aliases: ['GSX-S 950'],
		category: 'NAKED',
		yearFrom: 2021
	},
	{
		brand: 'suzuki',
		canonical: 'GSX-S750',
		typeCodes: ['GSXS750'],
		aliases: ['GSX-S 750'],
		category: 'NAKED',
		yearFrom: 2017
	},
	{
		brand: 'suzuki',
		canonical: 'SV650',
		typeCodes: ['SV650'],
		aliases: ['SV 650', 'SV650A', 'SV650X', 'SV 650 X'],
		category: 'NAKED'
	},
	{
		brand: 'suzuki',
		canonical: 'SV-7GX',
		typeCodes: ['SV650GX'],
		aliases: ['SV7GX', 'SV-7 GX'],
		category: 'SPORT_TOURING',
		yearFrom: 2025,
		note: 'Registered under the SV650 code with a GX suffix; a new model on that engine.'
	},
	{
		brand: 'suzuki',
		canonical: 'GSX-R1000',
		typeCodes: ['GSXR1000'],
		aliases: ['GSX R 1000', 'GSX-R 1000', 'GSX-R1000R', 'GSXR1000'],
		category: 'SUPERSPORT'
	},
	{
		brand: 'suzuki',
		canonical: 'GSX-R750',
		typeCodes: ['GSXR750'],
		aliases: ['GSX R 750', 'GSX-R 750', 'GSXR750'],
		category: 'SUPERSPORT'
	},
	{
		brand: 'suzuki',
		canonical: 'GSX-R600',
		typeCodes: ['GSXR600'],
		aliases: ['GSX R 600', 'GSX-R 600', 'GSXR600'],
		category: 'SUPERSPORT'
	},
	{ brand: 'suzuki', canonical: 'V-Strom 250', typeCodes: ['DL250'], category: 'ADVENTURE' },

	// --- Kawasaki ------------------------------------------------------------
	{
		brand: 'kawasaki',
		canonical: 'Ninja 1000SX',
		aliases: ['Z1000SX', 'Z1000 SX', 'Ninja 1000', 'Ninja 1000 SX', 'Z 1000 SX'],
		category: 'SPORT_TOURING',
		yearFrom: 2011,
		note: 'Sold as the Z1000SX until the 2020 restyle renamed it. One continuous machine.'
	},
	{
		brand: 'kawasaki',
		canonical: 'Ninja 1100SX',
		aliases: ['Ninja 1100 SX'],
		category: 'SPORT_TOURING',
		yearFrom: 2024
	},
	{ brand: 'kawasaki', canonical: 'Versys 1100', category: 'SPORT_TOURING', yearFrom: 2025 },
	{ brand: 'kawasaki', canonical: 'Eliminator', category: 'CRUISER' },
	{
		brand: 'kawasaki',
		canonical: 'Ninja H2 SX',
		aliases: ['Ninja H2 SX SE', 'H2 SX'],
		category: 'SPORT_TOURING'
	},
	{
		brand: 'kawasaki',
		canonical: 'Versys-X 300',
		aliases: ['Versys X 300', 'Versys-X300'],
		category: 'ADVENTURE'
	},
	{
		brand: 'kawasaki',
		canonical: 'Ninja 500',
		aliases: ['Ninja 500 SE'],
		category: 'SPORT',
		yearFrom: 2024
	},
	{ brand: 'kawasaki', canonical: 'Z125', category: 'NAKED' },
	{
		brand: 'kawasaki',
		canonical: 'Ninja ZX-4R',
		aliases: ['ZX-4R', 'ZX400', 'Ninja ZX-4RR'],
		category: 'SPORT'
	},

	// --- BMW: the registry spells R nineT four ways ---------------------------
	{
		brand: 'bmw',
		canonical: 'R nineT',
		aliases: ['R Nine T', 'R NineT', 'R Ninet', 'RnineT', 'R9T', 'R nine T'],
		category: 'CLASSIC',
		yearFrom: 2014
	},
	{
		brand: 'bmw',
		canonical: 'R nineT Scrambler',
		aliases: ['R Nine T Scrambler', 'R Ninet Scrambler', 'RnineT Scrambler'],
		category: 'SCRAMBLER',
		yearFrom: 2016
	},
	{
		brand: 'bmw',
		canonical: 'R nineT Pure',
		aliases: ['R Nine T Pure', 'R Ninet Pure'],
		category: 'CLASSIC'
	},
	{
		brand: 'bmw',
		canonical: 'R nineT Racer',
		aliases: ['R Nine T Racer', 'R Ninet Racer'],
		category: 'CAFE_RACER'
	},
	{
		brand: 'bmw',
		canonical: 'R nineT Urban G/S',
		aliases: ['R Nine T Urban G S', 'R nineT Urban GS', 'R Ninet Urban G/S', 'R Nine T Urban G/S'],
		category: 'CLASSIC'
	},
	{
		brand: 'bmw',
		canonical: 'R 12 nineT',
		aliases: ['R 12 Ninet', 'R12 nineT', 'R12nineT', 'R 12 Nine T'],
		category: 'CLASSIC',
		yearFrom: 2024
	},
	{
		brand: 'bmw',
		canonical: 'R 12 G/S',
		aliases: ['R 12 G S', 'R12 G/S', 'R12GS', 'R 12 GS'],
		category: 'SCRAMBLER',
		yearFrom: 2025
	},
	{ brand: 'bmw', canonical: 'R 12', aliases: ['R12'], category: 'CRUISER', yearFrom: 2024 },
	{ brand: 'bmw', canonical: 'F 900 R', aliases: ['F900R'], category: 'NAKED', yearFrom: 2020 },
	{
		brand: 'bmw',
		canonical: 'F 900 XR',
		aliases: ['F900XR'],
		category: 'SPORT_TOURING',
		yearFrom: 2020
	},
	{
		brand: 'bmw',
		canonical: 'F 900 GS Adventure',
		aliases: ['F900GSA', 'F900GS Adventure'],
		category: 'ADVENTURE',
		yearFrom: 2024
	},
	{
		brand: 'bmw',
		canonical: 'F 850 GS Adventure',
		aliases: ['F850GSA', 'F850GS Adventure'],
		category: 'ADVENTURE'
	},
	{ brand: 'bmw', canonical: 'F 750 GS', aliases: ['F750GS'], category: 'ADVENTURE' },
	{ brand: 'bmw', canonical: 'F 800 GT', aliases: ['F800GT'], category: 'SPORT_TOURING' },
	{ brand: 'bmw', canonical: 'F 800 R', aliases: ['F800R'], category: 'NAKED' },
	{ brand: 'bmw', canonical: 'G 310 R', aliases: ['G310R'], category: 'NAKED' },
	{ brand: 'bmw', canonical: 'G 310 GS', aliases: ['G310GS'], category: 'ADVENTURE' },
	{
		brand: 'bmw',
		canonical: 'F 450 GS',
		aliases: ['F450GS'],
		category: 'ADVENTURE',
		yearFrom: 2026
	},
	{ brand: 'bmw', canonical: 'C 400 GT', aliases: ['C400GT'], category: 'SCOOTER' },
	{ brand: 'bmw', canonical: 'C 400 X', aliases: ['C400X'], category: 'SCOOTER' },
	{ brand: 'bmw', canonical: 'C 650 GT', aliases: ['C650GT'], category: 'SCOOTER' },
	{
		brand: 'bmw',
		canonical: 'C 650 Sport',
		aliases: ['C650 Sport', 'C650Sport'],
		category: 'SCOOTER'
	},
	{ brand: 'bmw', canonical: 'CE 04', aliases: ['CE04', 'CE-04'], category: 'SCOOTER' },
	{ brand: 'bmw', canonical: 'R 1250 R', aliases: ['R1250R'], category: 'NAKED' },
	{ brand: 'bmw', canonical: 'R 1250 RS', aliases: ['R1250RS'], category: 'SPORT_TOURING' },
	{ brand: 'bmw', canonical: 'R 1200 R', aliases: ['R1200R'], category: 'NAKED' },
	{ brand: 'bmw', canonical: 'R 1200 RS', aliases: ['R1200RS'], category: 'SPORT_TOURING' },
	{ brand: 'bmw', canonical: 'R 1300 R', aliases: ['R1300R'], category: 'NAKED', yearFrom: 2025 },
	{
		brand: 'bmw',
		canonical: 'R 1300 RS',
		aliases: ['R1300RS'],
		category: 'SPORT_TOURING',
		yearFrom: 2025
	},
	{
		brand: 'bmw',
		canonical: 'R 1300 RT',
		aliases: ['R1300RT'],
		category: 'TOURING',
		yearFrom: 2025
	},
	{ brand: 'bmw', canonical: 'M 1000 XR', aliases: ['M1000XR'], category: 'SPORT_TOURING' },
	{ brand: 'bmw', canonical: 'M 1000 R', aliases: ['M1000R'], category: 'HYPER_NAKED' },
	{ brand: 'bmw', canonical: 'M 1000 RR', aliases: ['M1000RR'], category: 'SUPERSPORT' },
	{ brand: 'bmw', canonical: 'K 1600 GT', aliases: ['K1600GT'], category: 'TOURING' },
	{ brand: 'bmw', canonical: 'K 1600 GTL', aliases: ['K1600GTL'], category: 'TOURING' },
	{ brand: 'bmw', canonical: 'K 1600 B', aliases: ['K1600B'], category: 'TOURING' },
	{ brand: 'bmw', canonical: 'R 18', aliases: ['R18'], category: 'CRUISER', yearFrom: 2020 },
	{ brand: 'bmw', canonical: 'R 18 Classic', aliases: ['R18 Classic'], category: 'CRUISER' },
	{ brand: 'bmw', canonical: 'R 18 B', aliases: ['R18B', 'R18 B'], category: 'CRUISER' },

	// --- Triumph: a Tiger's trim letters are not separate motorcycles --------
	{
		brand: 'triumph',
		canonical: 'Tiger 800',
		aliases: [
			'Tiger XRX',
			'Tiger XCX',
			'Tiger XCA',
			'Tiger XRT',
			'Tiger XR',
			'Tiger XC',
			'Tiger 800 XC',
			'Tiger 800 XCX',
			'Tiger 800 XRX',
			'Tiger 800 XCA',
			'Tiger 800 XRT',
			'Tiger 800 XR'
		],
		category: 'ADVENTURE',
		yearFrom: 2010,
		yearTo: 2020,
		note: 'The XR/XC letters are road and off-road trims of the same 800.'
	},
	{
		brand: 'triumph',
		canonical: 'Tiger 900',
		aliases: [
			'Tiger 900 GT',
			'Tiger 900 GT PRO',
			'Tiger 900 GT Pro',
			'Tiger 900 GT Low',
			'Tiger 900 Rally',
			'Tiger 900 Rally PRO',
			'Tiger 900 Rally Pro',
			'Tiger 900 Aragon'
		],
		category: 'ADVENTURE',
		yearFrom: 2020
	},
	{
		brand: 'triumph',
		canonical: 'Tiger 1200',
		aliases: [
			'Tiger 1200 XCA',
			'Tiger 1200 XRT',
			'Tiger 1200 XCX',
			'Tiger 1200 XRX',
			'Tiger 1200 XR',
			'Tiger 1200 XC',
			'Tiger 1200 GT',
			'Tiger 1200 GT PRO',
			'Tiger 1200 GT Pro',
			'Tiger 1200 GT Explorer',
			'Tiger 1200 Rally',
			'Tiger 1200 Rally PRO',
			'Tiger 1200 Rally Pro',
			'Tiger 1200 Rally Explorer'
		],
		category: 'ADVENTURE',
		yearFrom: 2018,
		note: 'The 2018 XC/XR range and the 2022 GT/Rally range are generations of one name; see generations.ts.'
	},
	{
		brand: 'triumph',
		canonical: 'Speed Triple 1200',
		aliases: ['Speed Triple 1200 RS', 'Speed Triple 1200 RR', 'Speed Triple RS 1200'],
		category: 'HYPER_NAKED',
		yearFrom: 2021
	},
	{
		brand: 'triumph',
		canonical: 'Speed Triple',
		aliases: ['Speed Triple RS', 'Speed Triple R', 'Speed Triple S', 'Speed Triple 1050'],
		category: 'HYPER_NAKED',
		yearFrom: 1994,
		yearTo: 2020
	},
	{
		brand: 'triumph',
		canonical: 'Rocket 3',
		aliases: [
			'Rocket 3 GT',
			'Rocket 3 R',
			'Rocket III',
			'Rocket 3 Storm',
			'Rocket 3 Storm GT',
			'Rocket 3 Storm R'
		],
		category: 'CRUISER',
		yearFrom: 2019
	},
	{ brand: 'triumph', canonical: 'Tiger Sport 660', category: 'SPORT_TOURING', yearFrom: 2022 },
	{ brand: 'triumph', canonical: 'Tiger Sport 800', category: 'SPORT_TOURING', yearFrom: 2025 },
	{ brand: 'triumph', canonical: 'Speed 400', category: 'NAKED', yearFrom: 2024 },
	{ brand: 'triumph', canonical: 'Daytona 660', category: 'SPORT', yearFrom: 2024 },
	{
		brand: 'triumph',
		canonical: 'Scrambler 1200',
		aliases: ['Scrambler 1200 XE', 'Scrambler 1200 XC', 'Scrambler 1200 X'],
		category: 'SCRAMBLER',
		yearFrom: 2019
	},
	{
		brand: 'triumph',
		canonical: 'Bonneville Bobber',
		aliases: ['Bonneville Bobber Black', 'Bobber', 'Bobber Black'],
		category: 'BOBBER'
	},
	{
		brand: 'triumph',
		canonical: 'Bonneville T120',
		aliases: ['Bonneville T120 Black', 'T120', 'T120 Black'],
		category: 'CLASSIC',
		yearFrom: 2016
	},
	{
		brand: 'triumph',
		canonical: 'Bonneville T100',
		aliases: ['Bonneville T100 Black', 'T100', 'T100 Black'],
		category: 'CLASSIC'
	},
	{
		brand: 'triumph',
		canonical: 'Thruxton',
		aliases: ['Thruxton R', 'Thruxton RS', 'Thruxton 1200', 'Thruxton 1200 R'],
		category: 'CAFE_RACER'
	},

	// --- Ducati: the registry concatenates the whole range into one name -----
	{
		brand: 'ducati',
		canonical: 'Multistrada V4',
		aliases: [
			'Multistrada V4 S',
			'Multistrada V4S',
			'Multistrada V4, Multistrada V4 S',
			'Multistrada V4 S Travel',
			'Multistrada V4 S Grand Tour'
		],
		category: 'ADVENTURE',
		yearFrom: 2021,
		note: 'Pikes Peak, Rally and RS stay separate: different suspension, tank or engine.'
	},
	{
		brand: 'ducati',
		canonical: 'Multistrada V2',
		aliases: ['Multistrada V2 -S', 'Multistrada V2 S', 'Multistrada V2S'],
		category: 'ADVENTURE',
		yearFrom: 2022
	},
	{
		brand: 'ducati',
		canonical: 'Streetfighter V4',
		aliases: [
			'Streetfighter V4S',
			'Streetfighter V4 S',
			'Streetfighter V4 - S',
			'Streetfighter V4, Streetfighter V4S, Ducati Street',
			'Streetfighter V4 SP'
		],
		category: 'HYPER_NAKED',
		yearFrom: 2020
	},
	{
		brand: 'ducati',
		canonical: 'Streetfighter V2',
		aliases: ['Streetfighter V2 S'],
		category: 'HYPER_NAKED',
		yearFrom: 2022
	},
	{
		brand: 'ducati',
		canonical: 'Panigale V4',
		aliases: ['Panigale V4 S', 'Panigale V4S', 'Panigale V4 SP'],
		category: 'SUPERSPORT',
		yearFrom: 2018
	},
	{
		brand: 'ducati',
		canonical: 'Panigale V2',
		aliases: ['Panigale V2 S'],
		category: 'SUPERSPORT',
		yearFrom: 2020
	},
	{
		brand: 'ducati',
		canonical: 'DesertX',
		aliases: ['Desertx', 'Desert X', 'DesertX Rally'],
		category: 'ADVENTURE',
		yearFrom: 2022
	},
	{
		brand: 'ducati',
		canonical: 'Scrambler 800',
		aliases: [
			'Scrambler',
			'Scrambler Icon',
			'Scrambler Icon Dark',
			'Scrambler Ducati Scrambler Icon Ducati',
			'Scrambler Full Throttle',
			'Scrambler Nightshift',
			'Scrambler CR',
			'Scrambler Cafe Racer',
			'Scrambler Café Racer',
			'Scrambler DS',
			'Scrambler Desert Sled',
			'Scrambler Classic',
			'Scrambler Urban Enduro',
			'Scrambler Sixty2',
			'Scrambler Flat Track Pro',
			'Scrambler Mach 2.0',
			'Scrambler Street Classic'
		],
		category: 'SCRAMBLER',
		yearFrom: 2015,
		note: 'Icon, Full Throttle, Desert Sled and the rest are trims of one 803 cc machine.'
	},
	{
		brand: 'ducati',
		canonical: 'Scrambler 1100',
		aliases: [
			'Scrambler 1100 Sport',
			'Scrambler 1100 Special',
			'Scrambler 1100 Pro',
			'Scrambler 1100 Sport Pro',
			'Scrambler 1100 Dark Pro'
		],
		category: 'SCRAMBLER',
		yearFrom: 2018
	},
	{
		brand: 'ducati',
		canonical: 'Hypermotard 950',
		aliases: ['Hypermotard 950 SP', 'Hypermotard 950 RVE'],
		category: 'SUPERMOTO',
		yearFrom: 2019
	},
	{
		brand: 'ducati',
		canonical: 'Diavel 1260',
		aliases: ['Diavel 1260 S', 'Diavel 1260S'],
		category: 'CRUISER',
		yearFrom: 2019
	},
	{
		brand: 'ducati',
		canonical: 'XDiavel',
		aliases: ['Xdiavel', 'Xdiavel S', 'XDiavel S', 'XDiavel Dark', 'XDiavel Nera'],
		category: 'CRUISER',
		yearFrom: 2016
	},
	{ brand: 'ducati', canonical: 'Diavel V4', category: 'CRUISER', yearFrom: 2023 },
	{
		brand: 'ducati',
		canonical: 'Multistrada 1260',
		aliases: ['Multistrada 1260 S', 'Multistrada 1260S'],
		category: 'ADVENTURE',
		yearFrom: 2018,
		yearTo: 2020
	},
	{
		brand: 'ducati',
		canonical: 'Multistrada 950',
		aliases: ['Multistrada 950 S', 'Multistrada 950S'],
		category: 'ADVENTURE',
		yearFrom: 2017
	},
	{
		brand: 'ducati',
		canonical: 'Monster 1200',
		aliases: ['Monster 1200 S', 'Monster 1200S'],
		category: 'NAKED',
		yearFrom: 2014
	},
	{
		brand: 'ducati',
		canonical: 'SuperSport',
		aliases: [
			'Supersport',
			'Supersport S',
			'SuperSport S',
			'SuperSport 950',
			'SuperSport 950 S',
			'Supersport 950'
		],
		category: 'SPORT',
		yearFrom: 2017
	},

	// --- Harley-Davidson: FL and FX codes are the touring and Softail ranges --
	{
		brand: 'harleydavidson',
		canonical: 'Street Glide',
		aliases: ['Flhx', 'FLHX', 'Flhx Street Glide', 'FLHX Street Glide'],
		category: 'TOURING'
	},
	{
		brand: 'harleydavidson',
		canonical: 'Street Glide Special',
		aliases: ['Flhxs', 'FLHXS', 'Flhxs Street Glide Special'],
		category: 'TOURING'
	},
	{
		brand: 'harleydavidson',
		canonical: 'Street Glide ST',
		aliases: ['Flhxst', 'FLHXST'],
		category: 'TOURING'
	},
	{
		brand: 'harleydavidson',
		canonical: 'CVO Street Glide',
		aliases: ['Flhxse', 'FLHXSE'],
		category: 'TOURING'
	},
	{
		brand: 'harleydavidson',
		canonical: 'Road King',
		aliases: ['Flhr', 'FLHR', 'Flhr Road King', 'FLHR Road King'],
		category: 'TOURING'
	},
	{
		brand: 'harleydavidson',
		canonical: 'Road King Classic',
		aliases: ['Flhrc', 'FLHRC'],
		category: 'TOURING'
	},
	{
		brand: 'harleydavidson',
		canonical: 'Road King Special',
		aliases: ['Flhrxs', 'FLHRXS'],
		category: 'TOURING'
	},
	{
		brand: 'harleydavidson',
		canonical: 'Road Glide',
		aliases: ['Fltrx', 'FLTRX'],
		category: 'TOURING'
	},
	{
		brand: 'harleydavidson',
		canonical: 'Road Glide Special',
		aliases: ['Fltrxs', 'FLTRXS'],
		category: 'TOURING'
	},
	{
		brand: 'harleydavidson',
		canonical: 'Road Glide ST',
		aliases: ['Fltrxst', 'FLTRXST'],
		category: 'TOURING'
	},
	{
		brand: 'harleydavidson',
		canonical: 'Road Glide Limited',
		aliases: ['Fltrk', 'FLTRK'],
		category: 'TOURING'
	},
	{
		brand: 'harleydavidson',
		canonical: 'CVO Road Glide',
		aliases: ['Fltrxse', 'FLTRXSE'],
		category: 'TOURING'
	},
	{ brand: 'harleydavidson', canonical: 'CVO Road Glide ST', category: 'TOURING' },
	{
		brand: 'harleydavidson',
		canonical: 'Ultra Limited',
		aliases: ['Flhtk', 'FLHTK'],
		category: 'TOURING'
	},
	{
		brand: 'harleydavidson',
		canonical: 'CVO Limited',
		aliases: ['Flhtkse', 'FLHTKSE'],
		category: 'TOURING'
	},
	{ brand: 'harleydavidson', canonical: 'CVO Ultra Limited', category: 'TOURING' },
	{
		brand: 'harleydavidson',
		canonical: 'Electra Glide',
		aliases: [
			'Flht',
			'FLHT',
			'Electra Glide Standard',
			'Flhtcu',
			'FLHTCU',
			'Electra Glide Ultra Classic'
		],
		category: 'TOURING'
	},
	{
		brand: 'harleydavidson',
		canonical: 'Softail Standard',
		aliases: ['Fxst', 'FXST'],
		category: 'CRUISER'
	},
	{
		brand: 'harleydavidson',
		canonical: 'Softail Slim',
		aliases: ['Slim', 'Fls', 'FLS', 'Flsl', 'FLSL'],
		category: 'CRUISER'
	},
	{
		brand: 'harleydavidson',
		canonical: 'Fat Bob',
		aliases: [
			'FAT BOB',
			'FAT BOB 114',
			'Fat Bob 114',
			'Fxfb',
			'FXFB',
			'Fxfbs',
			'FXFBS',
			'Fxdf',
			'FXDF'
		],
		category: 'CRUISER'
	},
	{
		brand: 'harleydavidson',
		canonical: 'Fat Boy',
		aliases: [
			'Fatboy',
			'FAT BOY',
			'FAT BOY 114',
			'Fat Boy 114',
			'Flfb',
			'FLFB',
			'Flfbs',
			'FLFBS',
			'Flstf',
			'FLSTF'
		],
		category: 'CRUISER'
	},
	{
		brand: 'harleydavidson',
		canonical: 'Street Bob',
		aliases: [
			'Streetbob',
			'Street BOB',
			'Street BOB 114',
			'Street Bob 114',
			'Fxbb',
			'FXBB',
			'Fxbbs',
			'FXBBS',
			'Fxdb',
			'FXDB'
		],
		category: 'CRUISER'
	},
	{
		brand: 'harleydavidson',
		canonical: 'Breakout',
		aliases: ['Breakout 114', 'Breakout 117', 'Fxbr', 'FXBR', 'Fxbrs', 'FXBRS', 'Fxsb', 'FXSB'],
		category: 'CRUISER'
	},
	{
		brand: 'harleydavidson',
		canonical: 'Low Rider',
		aliases: ['LOW Rider', 'Fxlr', 'FXLR', 'Fxdl', 'FXDL'],
		category: 'CRUISER'
	},
	{
		brand: 'harleydavidson',
		canonical: 'Low Rider S',
		aliases: ['LOW Rider S', 'Fxlrs', 'FXLRS', 'Fxdls', 'FXDLS'],
		category: 'CRUISER'
	},
	{
		brand: 'harleydavidson',
		canonical: 'Low Rider ST',
		aliases: ['LOW Rider ST', 'Fxlrst', 'FXLRST'],
		category: 'CRUISER'
	},
	{
		brand: 'harleydavidson',
		canonical: 'Heritage Classic',
		aliases: [
			'Heritage Classic 114',
			'Heritage Softail Classic',
			'Flhc',
			'FLHC',
			'Flhcs',
			'FLHCS',
			'Flstc',
			'FLSTC'
		],
		category: 'CRUISER'
	},
	{
		brand: 'harleydavidson',
		canonical: 'Sport Glide',
		aliases: ['Flsb', 'FLSB'],
		category: 'CRUISER'
	},
	{
		brand: 'harleydavidson',
		canonical: 'FXDR 114',
		aliases: ['Fxdr 114', 'Fxdrs', 'FXDRS'],
		category: 'CRUISER'
	},
	{
		brand: 'harleydavidson',
		canonical: 'Iron 883',
		aliases: ['XL 883 N Iron', 'XL883N', 'XL883N Iron', 'Iron'],
		category: 'CRUISER'
	},
	{
		brand: 'harleydavidson',
		canonical: 'Iron 1200',
		aliases: ['XL1200NS', 'XL 1200 NS'],
		category: 'CRUISER'
	},
	{
		brand: 'harleydavidson',
		canonical: 'Forty-Eight',
		aliases: ['XL1200X Forty Eight', 'XL1200X', 'Forty Eight', 'Fortyeight', '48'],
		category: 'CRUISER'
	},
	{ brand: 'harleydavidson', canonical: 'Roadster', aliases: ['XL1200CX'], category: 'CRUISER' },
	{
		brand: 'harleydavidson',
		canonical: 'Superlow',
		aliases: ['XL883L', 'Superlow 883'],
		category: 'CRUISER'
	},
	{
		brand: 'harleydavidson',
		canonical: 'Superlow 1200T',
		aliases: ['XL1200T'],
		category: 'CRUISER'
	},
	{
		brand: 'harleydavidson',
		canonical: '1200 Custom',
		aliases: ['XL1200C', 'Sportster 1200 Custom'],
		category: 'CRUISER'
	},
	{
		brand: 'harleydavidson',
		canonical: 'Pan America 1250 Special',
		aliases: ['PAN America 1250 Special', 'PAN America Special', 'Pan America Special', 'RA1250S'],
		category: 'ADVENTURE',
		yearFrom: 2021
	},
	{
		brand: 'harleydavidson',
		canonical: 'Pan America 1250',
		aliases: ['PAN America', 'Pan America', 'PAN America 1250', 'RA1250'],
		category: 'ADVENTURE',
		yearFrom: 2021
	},
	{
		brand: 'harleydavidson',
		canonical: 'Sportster S',
		aliases: ['RH1250S'],
		category: 'CRUISER',
		yearFrom: 2021
	},
	{
		brand: 'harleydavidson',
		canonical: 'Nightster',
		aliases: ['RH975', 'Nightster Special', 'RH975S'],
		category: 'CRUISER'
	},
	{
		brand: 'harleydavidson',
		canonical: 'Street 750',
		aliases: ['XG750', 'XG 750'],
		category: 'CRUISER'
	},
	{
		brand: 'harleydavidson',
		canonical: 'Street Rod',
		aliases: ['Street ROD', 'XG750A'],
		category: 'CRUISER'
	},

	// --- KTM / Husqvarna -----------------------------------------------------
	{
		brand: 'ktm',
		canonical: '690 Duke',
		aliases: ['690DUKE', '690 DUKE', 'Duke 690', '690 Duke R'],
		category: 'NAKED'
	},
	{
		brand: 'ktm',
		canonical: '790 Duke',
		aliases: ['Duke 790', '790 Duke L'],
		category: 'NAKED',
		yearFrom: 2018,
		note: 'The L is the 35 kW A2 version.'
	},
	{
		brand: 'ktm',
		canonical: '690 Enduro R',
		aliases: ['690 Enduro R (30 KW)', '690 Enduro', '690 ENDURO R'],
		category: 'DUAL_SPORT'
	},
	{
		brand: 'ktm',
		canonical: '690 SMC R',
		aliases: ['690 SMC', '690 SMC-R', '690SMCR'],
		category: 'SUPERMOTO'
	},
	{ brand: 'ktm', canonical: 'RC 390', aliases: ['RC390'], category: 'SPORT' },
	{ brand: 'ktm', canonical: 'RC 125', aliases: ['RC125'], category: 'SPORT' },
	{
		brand: 'ktm',
		canonical: '1290 Super Duke GT',
		aliases: ['Super Duke GT'],
		category: 'SPORT_TOURING'
	},
	{
		brand: 'husqvarna',
		canonical: '701 Enduro',
		aliases: ['701 Enduro (49 KW)', '701 Enduro LR'],
		category: 'DUAL_SPORT'
	},
	{ brand: 'husqvarna', canonical: '701 Supermoto', aliases: ['701 SM'], category: 'SUPERMOTO' },
	{
		brand: 'husqvarna',
		canonical: 'Norden 901',
		aliases: ['901 Norden', 'Norden'],
		category: 'ADVENTURE',
		yearFrom: 2022
	},
	{
		brand: 'husqvarna',
		canonical: 'Norden 901 Expedition',
		aliases: ['901 Norden Expedition'],
		category: 'ADVENTURE',
		yearFrom: 2023
	},

	// --- Aprilia / Benelli / CFMOTO / Moto Guzzi / Royal Enfield / others ----
	{
		brand: 'aprilia',
		canonical: 'Tuono V4 Factory',
		aliases: ['Tuono V4 1100 Factory', 'Tuono V4 1100 Factory ABS', 'Tuono V4 Factory 1100'],
		category: 'HYPER_NAKED'
	},
	{
		brand: 'aprilia',
		canonical: 'Tuono V4',
		aliases: ['Tuono V4 1100', 'Tuono V4 1100 RR', 'Tuono V4 R', 'Tuono V4R'],
		category: 'HYPER_NAKED'
	},
	{
		brand: 'aprilia',
		canonical: 'Tuono 660',
		aliases: ['Tuono660', 'Tuono 660 Factory'],
		category: 'NAKED',
		yearFrom: 2021
	},
	{
		brand: 'aprilia',
		canonical: 'Tuareg 660',
		aliases: ['Tuareg', 'Tuareg 660 Rally'],
		category: 'ADVENTURE',
		yearFrom: 2022
	},
	{
		brand: 'aprilia',
		canonical: 'SR GT 200',
		aliases: ['SR GT200', 'SRGT 200'],
		category: 'SCOOTER'
	},
	{
		brand: 'aprilia',
		canonical: 'SR GT 400',
		aliases: ['SR GT400', 'SRGT 400'],
		category: 'SCOOTER'
	},
	{ brand: 'aprilia', canonical: 'RS 457', aliases: ['RS457'], category: 'SPORT', yearFrom: 2024 },
	{
		brand: 'benelli',
		canonical: 'TRK 502',
		aliases: ['TRK502', 'TRK502 X', 'TRK 502 X', 'TRK502X'],
		category: 'ADVENTURE'
	},
	{
		brand: 'benelli',
		canonical: 'TRK 702',
		aliases: ['TRK702', 'TRK 702 X', 'TRK702X', 'TRK702 X'],
		category: 'ADVENTURE',
		yearFrom: 2023
	},
	{ brand: 'benelli', canonical: 'Imperiale 400', category: 'CLASSIC' },
	{
		brand: 'benelli',
		canonical: 'Leoncino 500',
		aliases: ['Leoncino 500 Trail'],
		category: 'SCRAMBLER'
	},
	{
		brand: 'benelli',
		canonical: 'Leoncino 800',
		aliases: ['Leoncino 800 Trail'],
		category: 'SCRAMBLER'
	},
	{ brand: 'benelli', canonical: '752S', aliases: ['752 S'], category: 'NAKED' },
	{ brand: 'benelli', canonical: '502C', aliases: ['502C Cruiser', '502 C'], category: 'CRUISER' },
	{
		brand: 'benelli',
		canonical: 'Tornado Naked T 125',
		aliases: ['TNT 125', 'TNT125'],
		category: 'NAKED'
	},
	{ brand: 'cfmoto', canonical: '675SR-R', aliases: ['675SRR', '675 SR-R'], category: 'SPORT' },
	{ brand: 'cfmoto', canonical: '450SR', aliases: ['450 SR', '450SR S'], category: 'SPORT' },
	{ brand: 'cfmoto', canonical: '450CL-C', aliases: ['450CLC', '450 CL-C'], category: 'CRUISER' },
	{
		brand: 'cfmoto',
		canonical: '1000MT-X',
		aliases: ['1000MTX', '1000 MT-X', 'MT1000'],
		category: 'ADVENTURE'
	},
	{ brand: 'cfmoto', canonical: '800NK', aliases: ['NK800', '800 NK'], category: 'NAKED' },
	{ brand: 'cfmoto', canonical: '675NK', aliases: ['NK675', '675 NK'], category: 'NAKED' },
	{
		brand: 'motoguzzi',
		canonical: 'V85 TT',
		aliases: [
			'V85TT',
			'V85 TT Travel',
			'V85TT Travel',
			'V85 TT Adventure',
			'V85 TT Evocative',
			'V85 TT Strada'
		],
		category: 'ADVENTURE',
		yearFrom: 2019
	},
	{
		brand: 'motoguzzi',
		canonical: 'V100 Mandello',
		aliases: ['V100 Mandello S', 'V100'],
		category: 'SPORT_TOURING',
		yearFrom: 2022
	},
	{
		brand: 'motoguzzi',
		canonical: 'Stelvio',
		aliases: ['Stelvio (a.r.a.s.)', 'Stelvio NTX', 'Stelvio 1200'],
		category: 'ADVENTURE'
	},
	{
		brand: 'motoguzzi',
		canonical: 'V7',
		aliases: [
			'V7 Stone',
			'V7 Special',
			'V7 Classic',
			'V7 Racer',
			'V7 II Stone',
			'V7 II Special',
			'V7 III Stone',
			'V7 III Special',
			'V7 III Racer',
			'V7 850',
			'V7 Stone Special',
			'V7 Stone Corsa',
			'V7 Sport'
		],
		category: 'CLASSIC',
		yearFrom: 2008,
		note: 'Stone and Special are trims. The 744 → 853 cc step of 2021 is a generation, and the registry sees it.'
	},
	{
		brand: 'motomorini',
		canonical: 'X-Cape',
		aliases: ['X-Cape 650', 'XCape'],
		category: 'ADVENTURE'
	},
	{
		brand: 'royalenfield',
		canonical: 'Himalayan',
		aliases: ['Himalayan 411', 'Himalayan 450'],
		category: 'ADVENTURE'
	},
	{
		brand: 'royalenfield',
		canonical: 'Interceptor 650',
		aliases: ['Interceptor INT 650', 'INT 650', 'INT650', 'Interceptor'],
		category: 'CLASSIC',
		yearFrom: 2018
	},
	{
		brand: 'royalenfield',
		canonical: 'Continental GT 650',
		aliases: ['Continental GT', 'GT 650'],
		category: 'CAFE_RACER',
		yearFrom: 2018
	},
	{
		brand: 'royalenfield',
		canonical: 'Hunter 350',
		aliases: ['Hntr 350', 'HNTR 350', 'HNTR350'],
		category: 'CLASSIC',
		yearFrom: 2022
	},
	{ brand: 'royalenfield', canonical: 'Shotgun 650', category: 'CRUISER', yearFrom: 2024 },
	{ brand: 'royalenfield', canonical: 'Super Meteor 650', category: 'CRUISER', yearFrom: 2023 },
	{ brand: 'royalenfield', canonical: 'Meteor 350', category: 'CRUISER', yearFrom: 2021 },
	{
		brand: 'indian',
		canonical: 'Scout Bobber',
		aliases: ['Scout Bobber Twenty', 'Scout Bobber Sixty'],
		category: 'BOBBER'
	},
	{ brand: 'indian', canonical: 'Chief Bobber Dark Horse', category: 'BOBBER' },
	{ brand: 'indian', canonical: 'Roadmaster', category: 'TOURING' },
	{ brand: 'indian', canonical: 'Scout Rogue', category: 'CRUISER' },
	{
		brand: 'italjet',
		canonical: 'Dragster 200',
		aliases: ['DRAGSTER200', 'Dragster200'],
		category: 'SCOOTER'
	},
	{ brand: 'gasgas', canonical: 'EC 350F', aliases: ['EC350F'], category: 'DUAL_SPORT' },
	{ brand: 'gasgas', canonical: 'EC 300', aliases: ['EC300'], category: 'DUAL_SPORT' },
	{ brand: 'husqvarna', canonical: 'FE 350', category: 'DUAL_SPORT' },
	{ brand: 'husqvarna', canonical: 'FE 450', category: 'DUAL_SPORT' },
	{ brand: 'husqvarna', canonical: 'FE 501', category: 'DUAL_SPORT' },
	{
		brand: 'husqvarna',
		canonical: 'TE 300',
		aliases: ['TE 300I', 'TE 300i', 'TE300'],
		category: 'DUAL_SPORT'
	},
	{
		brand: 'piaggio',
		canonical: 'Beverly 400',
		aliases: ['Beverly 400 HPE', 'Beverly 400 S', 'Beverly 400 HPE S'],
		category: 'SCOOTER',
		yearFrom: 2021
	},
	{ brand: 'piaggio', canonical: 'Vespa GTV', category: 'SCOOTER' },
	{
		brand: 'piaggio',
		canonical: 'Medley 125',
		aliases: ['Medley', 'Medley 125 S', 'Medley S'],
		category: 'SCOOTER'
	},
	{ brand: 'kymco', canonical: 'AK 550', aliases: ['AK550'], category: 'SCOOTER' },
	{
		brand: 'kymco',
		canonical: 'Downtown',
		aliases: ['Downtown 300i', 'Downtown 350i', 'Downtown 125i'],
		category: 'SCOOTER'
	},
	{ brand: 'sym', canonical: 'JET 14', aliases: ['Jet 14', 'JET14'], category: 'SCOOTER' },
	{ brand: 'sym', canonical: 'JET X', aliases: ['Jet X', 'JETX'], category: 'SCOOTER' },
	{ brand: 'sym', canonical: 'ADX', aliases: ['ADX 125', 'ADX125'], category: 'SCOOTER' },
	{ brand: 'sym', canonical: 'Symphony ST', category: 'SCOOTER' },
	{ brand: 'mash', canonical: 'Belena 125', category: 'CLASSIC' },
	{
		brand: 'peugeot',
		canonical: 'Django',
		aliases: ['Django 125', 'Django 150'],
		category: 'SCOOTER'
	},

	// --- Categories the name classifier cannot know, from the modern audit ---
	//
	// Every entry below was a 2020-or-later generation filed as OTHER. A card
	// without a category can never enter a category round, so these are worth a
	// row each even where the machine is obscure.
	{ brand: 'kawasaki', canonical: 'J300', aliases: ['J 300'], category: 'SCOOTER' },
	{ brand: 'kawasaki', canonical: 'J125', aliases: ['J 125'], category: 'SCOOTER' },
	{
		brand: 'kawasaki',
		canonical: 'ZZR1400',
		aliases: ['ZZR 1400', 'ZZ-R1400', 'ZX-14', 'ZX-14R', 'ZX1400'],
		category: 'SPORT_TOURING'
	},
	{ brand: 'kawasaki', canonical: 'Z7 Hybrid', aliases: ['Z7', 'Z 7 Hybrid'], category: 'NAKED' },
	{ brand: 'suzuki', canonical: 'Address 110', typeCodes: ['UK110'], category: 'SCOOTER' },
	{ brand: 'suzuki', canonical: 'Address 125', typeCodes: ['UZ125'], category: 'SCOOTER' },
	{ brand: 'suzuki', canonical: 'GSX250R', aliases: ['GSX 250 R', 'GSX-250R'], category: 'SPORT' },
	{
		brand: 'harleydavidson',
		canonical: 'Fat Boy Lo',
		aliases: ['Flstfb', 'FLSTFB'],
		category: 'CRUISER'
	},
	{
		brand: 'harleydavidson',
		canonical: 'Sportster 1200',
		aliases: ['XL1200', 'XL 1200', 'XL1200N', 'XL1200V'],
		category: 'CRUISER'
	},
	{
		brand: 'harleydavidson',
		canonical: 'Sportster 883',
		aliases: ['XL883', 'XL 883', 'XL883C', 'XL883R'],
		category: 'CRUISER'
	},
	{
		brand: 'harleydavidson',
		canonical: 'Forty-Eight Special',
		aliases: ['XL1200XS'],
		category: 'CRUISER'
	},
	{
		brand: 'harleydavidson',
		canonical: 'Deluxe',
		aliases: ['Softail Deluxe', 'Flde', 'FLDE', 'Flstn', 'FLSTN'],
		category: 'CRUISER'
	},
	{
		brand: 'harleydavidson',
		canonical: 'Heritage Softail',
		aliases: ['Flst', 'FLST', 'Flsti', 'FLSTI'],
		category: 'CRUISER'
	},
	{
		brand: 'harleydavidson',
		canonical: 'Electra Glide Classic',
		aliases: ['FLH', 'Flhtc', 'FLHTC', 'Flhtci', 'FLHTCI'],
		category: 'TOURING'
	},
	{ brand: 'harleydavidson', canonical: 'Street Glide Limited', category: 'TOURING' },
	{
		brand: 'harleydavidson',
		canonical: 'Pan America 1250 ST',
		aliases: ['PAN America 1250 ST'],
		category: 'ADVENTURE'
	},
	{
		brand: 'harleydavidson',
		canonical: 'CVO Pan America',
		aliases: ['CVO PAN America'],
		category: 'ADVENTURE'
	},
	{
		brand: 'harleydavidson',
		canonical: 'Road King Police',
		aliases: ['Flhp', 'FLHP'],
		category: 'TOURING'
	},
	{
		brand: 'harleydavidson',
		canonical: 'Tour Glide',
		aliases: ['FLT', 'Flt'],
		category: 'TOURING'
	},
	{
		brand: 'harleydavidson',
		canonical: 'Revival',
		aliases: ['Electra Glide Revival'],
		category: 'TOURING'
	},
	{
		brand: 'mvagusta',
		canonical: 'F3 675',
		aliases: ['F3675', 'F3 675 RC'],
		category: 'SUPERSPORT'
	},
	{
		brand: 'mvagusta',
		canonical: 'F3 800',
		aliases: ['F3800', 'F3 800 RC', 'F3 RR'],
		category: 'SUPERSPORT'
	},
	{
		brand: 'mvagusta',
		canonical: 'Turismo Veloce',
		aliases: [
			'Turismo Veloce Lusso',
			'Turismo Veloce 800',
			'Turismo Veloce RC',
			'Turismo Veloce Lusso SCS'
		],
		category: 'SPORT_TOURING'
	},
	{
		brand: 'mvagusta',
		canonical: 'Superveloce',
		aliases: ['Superveloce 800', 'Superveloce S', 'Agusta Superveloce', 'Superveloce 1000'],
		category: 'SPORT'
	},
	{ brand: 'gasgas', canonical: 'EC 250', aliases: ['EC250'], category: 'DUAL_SPORT' },
	{ brand: 'gasgas', canonical: 'EC 450F', aliases: ['EC450F'], category: 'DUAL_SPORT' },
	{ brand: 'gasgas', canonical: 'ES 700', aliases: ['ES700'], category: 'DUAL_SPORT' },
	{ brand: 'gasgas', canonical: 'SM 700', aliases: ['SM700'], category: 'SUPERMOTO' },
	{
		brand: 'honda',
		canonical: 'CB1100',
		typeCodes: ['CB1100'],
		aliases: ['CB1100NA', 'CB1100 EX', 'CB1100 RS', 'CB1100A', 'CB 1100'],
		category: 'CLASSIC',
		yearFrom: 2010
	},
	{
		brand: 'motomorini',
		canonical: 'Seiemmezzo SCR',
		aliases: ['6 1 2 SCR', '6½ SCR', '6 1/2 SCR', 'Seiemmezzo 6 1/2 SCR'],
		category: 'SCRAMBLER'
	},
	{
		brand: 'motomorini',
		canonical: 'Seiemmezzo STR',
		aliases: ['6 1 2 STR', '6½ STR', '6 1/2 STR', 'Seiemmezzo 6 1/2 STR'],
		category: 'NAKED'
	},
	{
		brand: 'motomorini',
		canonical: 'X-Cape 700',
		aliases: ['X-Cape 700 Adventure'],
		category: 'ADVENTURE'
	},
	{ brand: 'ajp', canonical: 'PR7', aliases: ['PR7 Adventure'], category: 'DUAL_SPORT' },
	{ brand: 'triumph', canonical: 'Street Cup', aliases: ['Street CUP'], category: 'CAFE_RACER' },
	{
		brand: 'triumph',
		canonical: 'Tiger Explorer',
		aliases: [
			'Explorer',
			'Explorer XCX',
			'Explorer XRX',
			'Explorer XCA',
			'Explorer XRT',
			'Explorer XC',
			'Explorer XR',
			'Tiger Explorer XC',
			'Tiger Explorer XR',
			'Tiger Explorer 1200'
		],
		category: 'ADVENTURE',
		yearFrom: 2012,
		yearTo: 2017
	},
	{
		brand: 'triumph',
		canonical: 'TF 250-E',
		aliases: ['TF250-E', 'TF250E'],
		category: 'DUAL_SPORT'
	},
	{
		brand: 'triumph',
		canonical: 'TF 450-E',
		aliases: ['TF450-E', 'TF450E'],
		category: 'DUAL_SPORT'
	},
	{ brand: 'aprilia', canonical: 'Shiver 900', aliases: ['Shiver'], category: 'NAKED' },
	{ brand: 'aprilia', canonical: 'Dorsoduro 900', category: 'SUPERMOTO' },
	{
		brand: 'aprilia',
		canonical: 'Dorsoduro 750',
		aliases: ['Dorsoduro', 'SMV 750 Dorsoduro', 'SMV750'],
		category: 'SUPERMOTO'
	},
	{ brand: 'aprilia', canonical: 'SX 125', aliases: ['SX125'], category: 'SUPERMOTO' },
	{
		brand: 'husqvarna',
		canonical: 'TE 250',
		aliases: ['TE 250I', 'TE 250i', 'TE250'],
		category: 'DUAL_SPORT'
	},
	{ brand: 'husqvarna', canonical: 'FE 250', category: 'DUAL_SPORT' },
	{ brand: 'cfmoto', canonical: '650MT', aliases: ['MT650', '650 MT'], category: 'ADVENTURE' },
	{ brand: 'royalenfield', canonical: 'Scram 411', aliases: ['Scram'], category: 'SCRAMBLER' },
	{ brand: 'royalenfield', canonical: 'Guerrilla 450', aliases: ['Guerrilla'], category: 'NAKED' },
	{ brand: 'royalenfield', canonical: 'Bullet 350', category: 'CLASSIC' },
	{
		brand: 'royalenfield',
		canonical: 'Bullet 500',
		aliases: ['Bullet EFI', 'Bullet Classic EFI', 'Bullet 500 EFI'],
		category: 'CLASSIC'
	},
	{
		brand: 'rieju',
		canonical: 'MR',
		aliases: ['MR 300', 'MR 250', 'MR Racing'],
		category: 'DUAL_SPORT'
	},
	{ brand: 'sherco', canonical: '300 SEF-R', category: 'DUAL_SPORT' },
	{ brand: 'sherco', canonical: '300 SE-R', category: 'DUAL_SPORT' },
	{ brand: 'sherco', canonical: '250 SE-R', category: 'DUAL_SPORT' },
	{ brand: 'sherco', canonical: '125 SE-R', category: 'DUAL_SPORT' },
	{ brand: 'sherco', canonical: '450 SEF-R', category: 'DUAL_SPORT' },
	{
		brand: 'indian',
		canonical: 'FTR 1200',
		aliases: [
			'FTR',
			'FTR 1200 S',
			'FTR 1200 S Race Replica',
			'FTR R Carbon',
			'FTR Rally',
			'FTR Sport',
			'FTR 1200 Rally'
		],
		category: 'NAKED'
	},
	{
		brand: 'indian',
		canonical: 'Springfield',
		aliases: ['Springfield Dark Horse'],
		category: 'TOURING'
	},
	{
		brand: 'indian',
		canonical: 'Challenger',
		aliases: ['Challenger Dark Horse', 'Challenger Limited'],
		category: 'TOURING'
	},
	{
		brand: 'italjet',
		canonical: 'Dragster 300',
		aliases: ['DRAGSTER300', 'Dragster300'],
		category: 'SCOOTER'
	},
	{
		brand: 'italjet',
		canonical: 'Dragster 700 Twin',
		aliases: ['Dragster 700'],
		category: 'NAKED'
	},
	{ brand: 'benelli', canonical: 'BN125', aliases: ['BN 125'], category: 'NAKED' },
	{ brand: 'benelli', canonical: 'Leoncino 125', category: 'SCRAMBLER' },
	{ brand: 'voge', canonical: 'DS900X', aliases: ['900DSX', 'DS 900 X'], category: 'ADVENTURE' },
	{ brand: 'voge', canonical: '500DS', aliases: ['DS500', '500 DS'], category: 'ADVENTURE' },
	{ brand: 'voge', canonical: 'DS625X', aliases: ['625DSX', 'DS 625 X'], category: 'ADVENTURE' },
	{ brand: 'voge', canonical: '500R', aliases: ['500 R'], category: 'NAKED' },
	{ brand: 'voge', canonical: '500AC', aliases: ['500 AC'], category: 'CLASSIC' },
	{
		brand: 'hyosung',
		canonical: 'Aquila',
		aliases: ['Aquila 450', 'GV450', 'Aquila 650', 'GV650'],
		category: 'CRUISER'
	},
	{ brand: 'mash', canonical: 'Two Fifty', aliases: ['TWO Fifty', '250'], category: 'CLASSIC' },
	{ brand: 'mash', canonical: 'Five Hundred', category: 'CLASSIC' },
	{ brand: 'mash', canonical: 'Six Hundred', aliases: ['SIX Hundred'], category: 'CLASSIC' },
	{ brand: 'mash', canonical: 'Seventy-Five', aliases: ['Seventy Five'], category: 'CLASSIC' },
	{ brand: 'mash', canonical: 'Black Seven', category: 'CLASSIC' },
	{ brand: 'mash', canonical: 'TT 40', aliases: ['TT40'], category: 'CLASSIC' },
	{ brand: 'mash', canonical: 'X-Ride', aliases: ['X-Ride 650', 'XRide'], category: 'DUAL_SPORT' },
	{ brand: 'mash', canonical: 'New Seventy', aliases: ['NEW Seventy'], category: 'CLASSIC' },
	{ brand: 'ktm', canonical: '990 RC R', aliases: ['990 RC R'], category: 'SUPERSPORT' },
	{
		brand: 'yamaha',
		canonical: 'Niken',
		typeCodes: ['MXT850', 'MXT890'],
		aliases: ['Niken GT', 'MXT850 (niken)'],
		category: 'SPORT_TOURING'
	},
	{
		brand: 'yamaha',
		canonical: 'Bolt',
		typeCodes: ['XVS950CU', 'XV950'],
		aliases: ['XV950R', 'Bolt R-Spec'],
		category: 'CRUISER'
	},
	{
		brand: 'qjmotor',
		canonical: 'SRV 600 V',
		aliases: ['SRV600', 'SRV 600 V2'],
		category: 'CRUISER'
	},
	{ brand: 'qjmotor', canonical: 'SRK 921', aliases: ['SRK921'], category: 'NAKED' },
	{ brand: 'bsa', canonical: 'Bantam', aliases: ['Bantam 350'], category: 'CLASSIC' },
	{
		brand: 'bsa',
		canonical: 'Gold Star',
		aliases: ['Goldstar', 'Gold Star 650'],
		category: 'CLASSIC'
	},
	{ brand: 'lambretta', canonical: 'X125', aliases: ['X 125'], category: 'SCOOTER' },
	{ brand: 'morbidelli', canonical: 'T1002VX', category: 'ADVENTURE' },
	{ brand: 'morbidelli', canonical: 'T502X', category: 'ADVENTURE' },
	{ brand: 'kove', canonical: '800X', aliases: ['800X Pro', '800X Rally'], category: 'ADVENTURE' },
	{ brand: 'peugeot', canonical: 'Tweet', aliases: ['Tweet 125'], category: 'SCOOTER' },
	{
		brand: 'piaggio',
		canonical: 'Runner',
		aliases: ['Runner FX125', 'Runner 125', 'Runner 200'],
		category: 'SCOOTER'
	}
];

// ---------------------------------------------------------------------------
// Photographs that are not the motorcycle they are filed under
// ---------------------------------------------------------------------------

export interface RejectedImage {
	/** The Commons file name (without `File:`), or any other URL's file name. */
	file: string;
	/** Why it must not stand for this motorcycle. Shown to nobody, read by everybody. */
	reason: string;
}

/**
 * Photographs no rule can catch: the file name names the right model, the
 * article uses it, and it still shows something else — a one-off custom, a
 * concept, a race bike. Each entry says why. A rejected file is dropped from
 * every generation at rebuild; nothing about the source record changes.
 */
export const REJECTED_IMAGES: RejectedImage[] = [
	{
		file: "Kawasaki_Vulcan_S_-_MRS_Oficina_-_Mondial_de_l'Automobile_de_Paris_2018_-_001.jpg",
		reason:
			'A one-off café racer built by MRS Oficina, shown at the 2018 Paris show. Not the production Vulcan S.'
	}
];

const REJECTED_BY_FILE = new Map(
	REJECTED_IMAGES.map((r) => [r.file.toLowerCase().replace(/ /g, '_'), r])
);

/** The rejection for a URL or file title, if there is one. */
export function rejectedImage(urlOrTitle: string): RejectedImage | undefined {
	const last = urlOrTitle.split(/[?#]/)[0].split('/').pop() ?? '';
	let name = last;
	try {
		name = decodeURIComponent(last);
	} catch {
		/* keep the raw segment */
	}
	// A thumbnail rendering is "<width>px-<file>"; the file is what is listed.
	name = name.replace(/^\d+px-/, '').replace(/^File:/i, '');
	return REJECTED_BY_FILE.get(name.toLowerCase().replace(/ /g, '_'));
}
