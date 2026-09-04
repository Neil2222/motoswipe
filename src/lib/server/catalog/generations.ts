import { detectBoundaries, toSpans, type YearObservation } from './boundaries';
import { meaningfulYears } from './evidence';

/**
 * Generation boundaries a human established, with the reason written down.
 *
 * This file exists because the data cannot answer the question. The Dutch
 * registry records what a motorcycle weighs, costs and displaces — none of
 * which changes when a manufacturer restyles the bodywork. The Kawasaki Z900
 * was redesigned in 2020 and again in 2025 and gained three kilograms in total;
 * `boundaries.ts` correctly detects nothing, because there is nothing there to
 * detect.
 *
 * So generations that matter to somebody choosing a motorcycle by its looks
 * have to be curated. Three rules govern what goes in here:
 *
 *  1. **A boundary needs a reason and a reference.** Both fields are required.
 *     A boundary nobody can check is a guess with better formatting.
 *  2. **Uncertainty stays out.** A family with no entry here keeps
 *     `boundarySource: UNKNOWN` and one generation spanning its whole era. The
 *     card then says the years are unknown, which is true. Inventing a split
 *     would be worse than admitting we do not know. The families reviewed and
 *     deliberately left out are listed at the bottom, with why.
 *  3. **A variant is not a generation.** ABS, SE, SP, GT, A2 and the like are
 *     the same motorcycle differently equipped. Only a materially different
 *     machine — new bodywork, new frame, new engine — earns an entry.
 *
 * Where an entry does not cover a family's whole run, the uncovered years form
 * their own generation with `UNKNOWN` boundaries: knowing the 2017 split does
 * not mean knowing how 2006–2016 divides, and the data says so.
 *
 * This is data. Nothing in `boundaries.ts` or `rebuild.ts` refers to any
 * motorcycle by name; adding a family here is adding rows and running
 * `npm run db:rebuild`, with no import and no code change.
 */

export interface CuratedGeneration {
	/** First model year of this generation. */
	from: number;
	/** Last model year, or omitted while it is still current. */
	to?: number;
	/** What changed. One line, specific enough to argue with. */
	reason: string;
}

export interface CuratedFamilyGenerations {
	/** Normalised brand key, as `normalizeBrand` produces. */
	brand: string;
	/** The canonical family name, as `identity.ts` produces. */
	family: string;
	/** Where this was checked. Required — an unsourced boundary is a guess. */
	reference: string;
	generations: CuratedGeneration[];
}

const WP = 'Wikipedia article';

/**
 * Curated boundaries, keyed by family.
 *
 * Reviewed against the top fifty families by Dutch registrations plus the
 * current-market families the registry files under type codes. Every entry
 * below is either visible in the registry's own numbers (a capacity or rated
 * power step) or a redesign documented in the manufacturer's model-year
 * announcements and the referenced encyclopedia article.
 */
export const CURATED_GENERATIONS: CuratedFamilyGenerations[] = [
	// --- BMW -----------------------------------------------------------------
	{
		brand: 'bmw',
		family: 'R 1200 GS',
		reference: `${WP} "BMW R1200GS"; BMW Motorrad model-year 2013 launch`,
		generations: [
			{ from: 2004, to: 2012, reason: 'Air/oil-cooled boxer (hexhead, twin-cam from 2010)' },
			{ from: 2013, reason: 'Liquid-cooled "LC" boxer: new engine, frame and bodywork' }
		]
	},
	{
		brand: 'bmw',
		family: 'R 1200 GS Adventure',
		reference: `${WP} "BMW R1200GS"; BMW Motorrad model-year 2014 launch`,
		generations: [
			{ from: 2006, to: 2013, reason: 'Air/oil-cooled boxer' },
			{ from: 2014, reason: 'Liquid-cooled "LC" boxer, new frame and bodywork' }
		]
	},
	{
		brand: 'bmw',
		family: 'R 1200 RT',
		reference: `${WP} "BMW R1200RT"`,
		generations: [
			{ from: 2004, to: 2013, reason: 'Air/oil-cooled boxer' },
			{ from: 2014, reason: 'Liquid-cooled boxer, new fairing and chassis' }
		]
	},
	{
		brand: 'bmw',
		family: 'R 1250 GS',
		reference: `${WP} "BMW R1250GS"`,
		generations: [{ from: 2018, reason: 'ShiftCam boxer throughout; one generation' }]
	},
	{
		brand: 'bmw',
		family: 'R 1250 GS Adventure',
		reference: `${WP} "BMW R1250GS"`,
		generations: [{ from: 2018, reason: 'ShiftCam boxer throughout; one generation' }]
	},
	{
		brand: 'bmw',
		family: 'R 1250 RT',
		reference: 'BMW Motorrad model-year 2021 announcement',
		generations: [
			{ from: 2018, to: 2020, reason: 'Launch model' },
			{ from: 2021, reason: 'New front, 10.25-inch TFT dash, radar cruise option' }
		]
	},
	{
		brand: 'bmw',
		family: 'R 1300 GS',
		reference: `${WP} "BMW R1300GS"`,
		generations: [{ from: 2023, reason: 'New engine and frame; one generation so far' }]
	},
	{
		brand: 'bmw',
		family: 'R1150 RT',
		reference: `${WP} "BMW R1150RT"`,
		generations: [{ from: 2000, reason: 'One generation' }]
	},
	{
		brand: 'bmw',
		family: 'R1150 GS',
		reference: `${WP} "BMW R1150GS"`,
		generations: [{ from: 1999, reason: 'One generation' }]
	},
	{
		brand: 'bmw',
		family: 'S 1000 XR',
		reference: `${WP} "BMW S1000XR"; BMW Motorrad model-year 2020 launch`,
		generations: [
			{ from: 2015, to: 2019, reason: 'Launch model' },
			{ from: 2020, reason: 'New frame, lighter, restyled, ShiftCam engine' }
		]
	},
	{
		brand: 'bmw',
		family: 'S 1000 RR',
		reference: `${WP} "BMW S1000RR"`,
		generations: [
			{ from: 2009, to: 2011, reason: 'Launch model' },
			{ from: 2012, to: 2014, reason: 'Revised chassis and electronics' },
			{ from: 2015, to: 2018, reason: 'New frame, revised engine, restyled' },
			{ from: 2019, to: 2022, reason: 'All new: ShiftCam engine, symmetrical headlights' },
			{ from: 2023, reason: 'Winglets, revised chassis, more power' }
		]
	},
	{
		brand: 'bmw',
		family: 'F650GS',
		reference: `${WP} "BMW F650GS"`,
		generations: [
			{ from: 2000, to: 2007, reason: 'Single-cylinder Rotax F650GS' },
			{ from: 2008, reason: 'Parallel-twin 798 cc: a different motorcycle sharing the name' }
		]
	},
	{
		brand: 'bmw',
		family: 'F 800 GS',
		reference: `${WP} "BMW F800GS"; BMW Motorrad model-year 2024 launch`,
		generations: [
			{ from: 2008, to: 2012, reason: 'Launch model, 798 cc twin' },
			{ from: 2013, to: 2023, reason: 'Restyle and revised chassis; sold through run-out stock' },
			{ from: 2024, reason: 'New F 800 GS on the F 900 platform, 895 cc' }
		]
	},
	{
		brand: 'bmw',
		family: 'G 310 R',
		reference: 'BMW Motorrad model-year 2021 announcement',
		generations: [
			{ from: 2016, to: 2020, reason: 'Launch model' },
			{ from: 2021, reason: 'Euro5, LED lighting, ride-by-wire, restyled' }
		]
	},
	{
		brand: 'bmw',
		family: 'G 310 GS',
		reference: 'BMW Motorrad model-year 2021 announcement',
		generations: [
			{ from: 2017, to: 2020, reason: 'Launch model' },
			{ from: 2021, reason: 'Euro5, LED lighting, ride-by-wire, restyled' }
		]
	},

	// --- Yamaha --------------------------------------------------------------
	{
		brand: 'yamaha',
		family: 'MT-07',
		reference: `${WP} "Yamaha MT-07"; Yamaha model-year 2018, 2021 and 2025 launches`,
		generations: [
			{ from: 2014, to: 2017, reason: 'Launch bodywork' },
			{ from: 2018, to: 2020, reason: 'Restyled tank shrouds and lights, revised suspension' },
			{ from: 2021, to: 2024, reason: 'Euro5, new bodywork, radial brakes, LED headlight' },
			{ from: 2025, reason: 'New bodywork, TFT dash, ride-by-wire, Y-AMT option' }
		]
	},
	{
		brand: 'yamaha',
		family: 'MT-09',
		reference: `${WP} "Yamaha MT-09"; capacity step visible in the registry`,
		generations: [
			{ from: 2013, to: 2016, reason: 'Launch model, 847 cc' },
			{ from: 2017, to: 2020, reason: 'Restyle, quickshifter, revised suspension' },
			{ from: 2021, to: 2023, reason: 'Capacity 847 → 890 cc, new frame and bodywork' },
			{ from: 2024, reason: 'New bodywork and headlight, revised ergonomics' }
		]
	},
	{
		brand: 'yamaha',
		family: 'MT-10',
		reference: `${WP} "Yamaha MT-10"; Yamaha model-year 2022 launch`,
		generations: [
			{ from: 2016, to: 2021, reason: 'Launch model' },
			{ from: 2022, reason: 'Euro5, new bodywork, TFT, revised engine' }
		]
	},
	{
		brand: 'yamaha',
		family: 'MT-03',
		reference: 'Yamaha model-year 2020 launch',
		generations: [
			{ from: 2016, to: 2019, reason: 'Launch model' },
			{ from: 2020, reason: 'Restyled with MT-family front, inverted forks' }
		]
	},
	{
		brand: 'yamaha',
		family: 'MT-125',
		reference: 'Yamaha model-year 2020 launch',
		generations: [
			{ from: 2014, to: 2019, reason: 'Launch model' },
			{ from: 2020, reason: 'New VVA engine, new frame and bodywork' }
		]
	},
	{
		brand: 'yamaha',
		family: 'Tracer 9',
		reference: `${WP} "Yamaha Tracer 900"; capacity step visible in the registry`,
		generations: [
			{ from: 2017, to: 2020, reason: 'Tracer 900 and 900 GT, 847 cc' },
			{ from: 2021, reason: 'Capacity 847 → 890 cc, new frame, renamed Tracer 9' }
		]
	},
	{
		brand: 'yamaha',
		family: 'Tracer 7',
		reference: 'Yamaha model-year 2020 and 2025 launches',
		generations: [
			{ from: 2016, to: 2019, reason: 'Tracer 700' },
			{ from: 2020, to: 2024, reason: 'Restyle, renamed Tracer 7' },
			{ from: 2025, reason: 'All-new bodywork, TFT dash, ride-by-wire' }
		]
	},
	{
		brand: 'yamaha',
		family: 'Ténéré 700',
		reference: 'Yamaha model-year 2025 launch',
		generations: [
			{ from: 2019, to: 2024, reason: 'Launch model' },
			{ from: 2025, reason: 'Ride-by-wire, new TFT dash, revised suspension' }
		]
	},
	{
		brand: 'yamaha',
		family: 'XSR900',
		reference: 'Yamaha model-year 2022 launch; capacity step visible in the registry',
		generations: [
			{ from: 2016, to: 2021, reason: 'Original, 847 cc' },
			{ from: 2022, reason: 'Capacity 847 → 890 cc, new frame and bodywork' }
		]
	},
	{
		brand: 'yamaha',
		family: 'YZF-R1',
		reference: `${WP} "Yamaha YZF-R1"`,
		generations: [
			{ from: 1998, to: 1999, reason: 'First generation' },
			{ from: 2000, to: 2001, reason: 'Revised bodywork and chassis' },
			{ from: 2002, to: 2003, reason: 'Fuel injection, new frame' },
			{ from: 2004, to: 2006, reason: 'Underseat exhausts, new frame' },
			{ from: 2007, to: 2008, reason: 'Four-valve head, YCC-T' },
			{ from: 2009, to: 2014, reason: 'Crossplane crankshaft' },
			{ from: 2015, reason: 'MotoGP-derived electronics, new frame and bodywork' }
		]
	},
	{
		brand: 'yamaha',
		family: 'YZF-R6',
		reference: `${WP} "Yamaha YZF-R6"`,
		generations: [
			{ from: 1999, to: 2002, reason: 'First generation' },
			{ from: 2003, to: 2005, reason: 'Fuel injection, new frame' },
			{ from: 2006, to: 2007, reason: 'New engine, YCC-T' },
			{ from: 2008, to: 2016, reason: 'New frame and bodywork, YCC-I' },
			{ from: 2017, reason: 'R1-derived front end and fairing' }
		]
	},
	{
		brand: 'yamaha',
		family: 'YZF-R3',
		reference: 'Yamaha model-year 2019 and 2025 launches',
		generations: [
			{ from: 2015, to: 2018, reason: 'Launch model' },
			{ from: 2019, to: 2024, reason: 'Restyle, inverted forks, LCD dash' },
			{ from: 2025, reason: 'New bodywork, TFT dash' }
		]
	},
	{
		brand: 'yamaha',
		family: 'YZF-R125',
		reference: `${WP} "Yamaha YZF-R125"`,
		generations: [
			{ from: 2008, to: 2013, reason: 'Launch model' },
			{ from: 2014, to: 2018, reason: 'New frame and bodywork, inverted forks' },
			{ from: 2019, to: 2022, reason: 'VVA engine, restyled' },
			{ from: 2023, reason: 'R7-style bodywork, TFT dash' }
		]
	},
	{
		brand: 'yamaha',
		family: 'FJR1300',
		reference: `${WP} "Yamaha FJR1300"`,
		generations: [
			{ from: 2001, to: 2005, reason: 'Original FJR' },
			{ from: 2006, to: 2012, reason: 'Restyle, electronic suspension option, AS version' },
			{ from: 2013, to: 2015, reason: 'New bodywork, dash and traction control' },
			{ from: 2016, reason: 'Six-speed gearbox, LED lighting' }
		]
	},
	{
		brand: 'yamaha',
		family: 'Super Ténéré 1200',
		reference: `${WP} "Yamaha XT1200Z Super Ténéré"`,
		generations: [
			{ from: 2010, to: 2013, reason: 'Launch model' },
			{ from: 2014, reason: 'Ride-by-wire, cruise control, electronic suspension (ZE)' }
		]
	},
	{
		brand: 'yamaha',
		family: 'TMAX',
		reference: `${WP} "Yamaha TMAX"; capacity steps 500 → 530 → 560 cc visible in the registry`,
		generations: [
			{ from: 2001, to: 2007, reason: 'Original TMAX 500' },
			{ from: 2008, to: 2011, reason: 'Second-generation 500, aluminium frame' },
			{ from: 2012, to: 2016, reason: 'Capacity 499 → 530 cc, belt drive' },
			{ from: 2017, to: 2019, reason: 'Restyle, DX/SX versions' },
			{ from: 2020, to: 2021, reason: 'Capacity 530 → 562 cc' },
			{ from: 2022, reason: 'New bodywork and TFT dash' }
		]
	},

	// --- Kawasaki ------------------------------------------------------------
	{
		brand: 'kawasaki',
		family: 'Z900',
		reference: `${WP} "Kawasaki Z900"; Kawasaki model-year 2020 and 2025 launches`,
		generations: [
			{ from: 2017, to: 2019, reason: 'Launch model' },
			{ from: 2020, to: 2024, reason: 'Restyle, LED lighting, TFT dash, traction control' },
			{ from: 2025, reason: 'Second restyle, ride-by-wire, IMU electronics' }
		]
	},
	{
		brand: 'kawasaki',
		family: 'Z650',
		reference: `${WP} "Kawasaki Z650"; Kawasaki model-year 2020 launch`,
		generations: [
			{ from: 2016, to: 2019, reason: 'Replaced the ER-6n; new trellis frame' },
			{ from: 2020, reason: 'Restyle, LED headlight, TFT dash' }
		]
	},
	{
		brand: 'kawasaki',
		family: 'Z750',
		reference: `${WP} "Kawasaki Z750"`,
		generations: [
			{ from: 2004, to: 2006, reason: 'Original Z750' },
			{ from: 2007, reason: 'New frame, engine revisions and bodywork' }
		]
	},
	{
		brand: 'kawasaki',
		family: 'Z800',
		reference: `${WP} "Kawasaki Z800"`,
		generations: [{ from: 2012, reason: 'One generation' }]
	},
	{
		brand: 'kawasaki',
		family: 'Z1000',
		reference: `${WP} "Kawasaki Z1000"`,
		generations: [
			{ from: 2003, to: 2006, reason: 'First series, ZX-9R-derived engine' },
			{ from: 2007, to: 2009, reason: 'Restyle, revised chassis' },
			{ from: 2010, to: 2013, reason: 'All new: 1043 cc engine, aluminium frame' },
			{ from: 2014, reason: '"Sugomi" bodywork' }
		]
	},
	{
		brand: 'kawasaki',
		family: 'Ninja 650',
		reference: `${WP} "Kawasaki Ninja 650R"`,
		generations: [
			{ from: 2006, to: 2011, reason: 'ER-6f' },
			{ from: 2012, to: 2016, reason: 'Restyled ER-6f, new frame' },
			{ from: 2017, to: 2019, reason: 'New trellis frame, lighter, renamed Ninja 650' },
			{ from: 2020, reason: 'Restyle, LED lighting, TFT dash' }
		]
	},
	{
		brand: 'kawasaki',
		family: 'Ninja 1000SX',
		reference: `${WP} "Kawasaki Ninja 1000"`,
		generations: [
			{ from: 2011, to: 2013, reason: 'Z1000SX launch model' },
			{ from: 2014, to: 2016, reason: 'Restyle, traction control' },
			{ from: 2017, to: 2019, reason: 'Restyle, IMU electronics' },
			{ from: 2020, reason: 'Restyle, single exhaust, TFT dash, renamed Ninja 1000SX' }
		]
	},
	{
		brand: 'kawasaki',
		family: 'Versys 650',
		reference: `${WP} "Kawasaki Versys 650"`,
		generations: [
			{ from: 2007, to: 2009, reason: 'Original Versys' },
			{ from: 2010, to: 2014, reason: 'Restyled front' },
			{ from: 2015, to: 2021, reason: 'New bodywork, frame revisions' },
			{ from: 2022, reason: 'Restyle, TFT dash, traction control' }
		]
	},
	{
		brand: 'kawasaki',
		family: 'Versys 1000',
		reference: `${WP} "Kawasaki Versys 1000"`,
		generations: [
			{ from: 2012, to: 2014, reason: 'Launch model' },
			{ from: 2015, to: 2018, reason: 'Restyled bodywork' },
			{ from: 2019, reason: 'New front, LED cornering lights, TFT' }
		]
	},
	{
		brand: 'kawasaki',
		family: 'ER-6N',
		reference: `${WP} "Kawasaki ER-6N"`,
		generations: [
			{ from: 2006, to: 2008, reason: 'Original ER-6n' },
			{ from: 2009, to: 2011, reason: 'Restyle' },
			{ from: 2012, reason: 'New frame and bodywork' }
		]
	},
	{
		brand: 'kawasaki',
		family: 'Ninja ZX-6R',
		reference: `${WP} "Kawasaki Ninja ZX-6R"`,
		generations: [
			{ from: 2003, to: 2004, reason: '636 cc, radial brakes' },
			{ from: 2005, to: 2006, reason: 'New frame and bodywork' },
			{ from: 2007, to: 2008, reason: '599 cc, new chassis' },
			{ from: 2009, to: 2012, reason: 'New frame, Showa BPF forks' },
			{ from: 2013, to: 2018, reason: 'Back to 636 cc' },
			{ from: 2019, to: 2023, reason: 'Restyle, quickshifter' },
			{ from: 2024, reason: 'Restyle, TFT dash' }
		]
	},
	{
		brand: 'kawasaki',
		family: 'Ninja ZX-10R',
		reference: `${WP} "Kawasaki Ninja ZX-10R"`,
		generations: [
			{ from: 2004, to: 2005, reason: 'First generation' },
			{ from: 2006, to: 2007, reason: 'New bodywork and chassis' },
			{ from: 2008, to: 2010, reason: 'New engine and frame' },
			{ from: 2011, to: 2015, reason: 'All new, traction control' },
			{ from: 2016, to: 2020, reason: 'New engine internals, IMU electronics' },
			{ from: 2021, reason: 'Winglets, new bodywork, TFT' }
		]
	},
	{
		brand: 'kawasaki',
		family: 'Vulcan S',
		reference: `${WP} "Kawasaki Vulcan S"`,
		generations: [{ from: 2015, reason: 'One generation' }]
	},
	{
		brand: 'kawasaki',
		family: 'Z900RS',
		reference: `${WP} "Kawasaki Z900RS"`,
		generations: [{ from: 2018, reason: 'One generation' }]
	},

	// --- Honda ---------------------------------------------------------------
	{
		brand: 'honda',
		family: 'NC750X',
		reference: `${WP} "Honda NC700 series"; rated power step visible in the registry`,
		generations: [
			{ from: 2013, to: 2015, reason: 'Launch NC750X, 745 cc' },
			{ from: 2016, to: 2020, reason: 'Restyle, LED lighting, revised DCT' },
			{ from: 2021, reason: 'Rated power 40.3 → 43.1 kW, new frame and bodywork' }
		]
	},
	{
		brand: 'honda',
		family: 'X-ADV',
		reference: `${WP} "Honda X-ADV"; Honda model-year 2021 launch`,
		generations: [
			{ from: 2017, to: 2020, reason: 'Launch model' },
			{ from: 2021, reason: 'New frame and bodywork, more power' }
		]
	},
	{
		brand: 'honda',
		family: 'CB650R',
		reference: 'Honda model-year 2024 launch',
		generations: [
			{ from: 2019, to: 2023, reason: 'Launch model' },
			{ from: 2024, reason: 'Restyle, TFT dash, E-Clutch option' }
		]
	},
	{
		brand: 'honda',
		family: 'CBR650R',
		reference: 'Honda model-year 2024 launch',
		generations: [
			{ from: 2019, to: 2023, reason: 'Launch model' },
			{ from: 2024, reason: 'Restyle, TFT dash, E-Clutch option' }
		]
	},
	{
		brand: 'honda',
		family: 'CB1000R',
		reference: `${WP} "Honda CB1000R"`,
		generations: [
			{ from: 2008, to: 2017, reason: 'Original CB1000R' },
			{ from: 2018, to: 2020, reason: 'All new "Neo Sports Café"' },
			{ from: 2021, reason: 'Restyle, TFT dash, Black Edition' }
		]
	},
	{
		brand: 'honda',
		family: 'CB500X',
		reference: `${WP} "Honda CB500X"`,
		generations: [
			{ from: 2013, to: 2015, reason: 'Launch model' },
			{ from: 2016, to: 2018, reason: 'Restyle, LED lighting, taller screen' },
			{ from: 2019, reason: '19-inch front wheel, longer travel, restyled' }
		]
	},
	{
		brand: 'honda',
		family: 'CB500F',
		reference: `${WP} "Honda CB500F"`,
		generations: [
			{ from: 2013, to: 2015, reason: 'Launch model' },
			{ from: 2016, to: 2018, reason: 'Restyle, LED lighting' },
			{ from: 2019, reason: 'Restyle, inverted forks from 2022' }
		]
	},
	{
		brand: 'honda',
		family: 'CBR1000RR Fireblade',
		reference: `${WP} "Honda CBR1000RR"`,
		generations: [
			{ from: 2004, to: 2007, reason: 'SC57' },
			{ from: 2008, to: 2011, reason: 'SC59: new engine and fairing' },
			{ from: 2012, to: 2016, reason: 'SC59 facelift, Showa BPF forks' },
			{ from: 2017, to: 2019, reason: 'SC77: lighter, new electronics' },
			{ from: 2020, reason: 'SC82 CBR1000RR-R: all new' }
		]
	},
	{
		brand: 'honda',
		family: 'CBR600RR',
		reference: `${WP} "Honda CBR600RR"; Honda model-year 2024 launch`,
		generations: [
			{ from: 2003, to: 2004, reason: 'Launch model' },
			{ from: 2005, to: 2006, reason: 'New frame, inverted forks' },
			{ from: 2007, to: 2012, reason: 'All new, lighter, revised engine' },
			{ from: 2013, to: 2020, reason: 'Restyle, Showa BPF forks' },
			{ from: 2024, reason: 'Returned to Europe as a new model: winglets, ride-by-wire, TFT' }
		]
	},
	{
		brand: 'honda',
		family: 'Gold Wing',
		reference: `${WP} "Honda Gold Wing"`,
		generations: [
			{ from: 2001, to: 2017, reason: 'GL1800 first generation' },
			{ from: 2018, reason: 'All new: double-wishbone front, DCT, lighter' }
		]
	},
	{
		brand: 'honda',
		family: 'ST1300A',
		reference: `${WP} "Honda ST1300"`,
		generations: [{ from: 2002, reason: 'One generation' }]
	},
	{
		brand: 'honda',
		family: 'CRF1000L Africa Twin',
		reference: `${WP} "Honda Africa Twin"`,
		generations: [{ from: 2016, reason: 'One generation; replaced by the CRF1100L in 2020' }]
	},

	// --- Suzuki --------------------------------------------------------------
	{
		brand: 'suzuki',
		family: 'V-Strom 650',
		reference: `${WP} "Suzuki V-Strom 650"`,
		generations: [
			{ from: 2004, to: 2011, reason: 'Original DL650' },
			{ from: 2012, to: 2016, reason: 'New frame, beak-nose bodywork' },
			{ from: 2017, reason: 'Restyle, LED lighting, traction control, Euro4' }
		]
	},
	{
		brand: 'suzuki',
		family: 'V-Strom 1000',
		reference: `${WP} "Suzuki V-Strom 1000"`,
		generations: [
			{ from: 2002, to: 2013, reason: 'Original DL1000' },
			{ from: 2014, reason: 'New engine, frame and bodywork; replaced by the 1050 in 2020' }
		]
	},
	{
		brand: 'suzuki',
		family: 'GSX-R1000',
		reference: `${WP} "Suzuki GSX-R1000"`,
		generations: [
			{ from: 2001, to: 2002, reason: 'K1–K2' },
			{ from: 2003, to: 2004, reason: 'K3–K4' },
			{ from: 2005, to: 2006, reason: 'K5–K6' },
			{ from: 2007, to: 2008, reason: 'K7–K8' },
			{ from: 2009, to: 2016, reason: 'K9 onward' },
			{ from: 2017, reason: 'L7: variable valve timing, new frame' }
		]
	},
	{
		brand: 'suzuki',
		family: 'GSX-S1000',
		reference: 'Suzuki model-year 2021 launch',
		generations: [
			{ from: 2015, to: 2020, reason: 'Launch model' },
			{ from: 2021, reason: 'Restyle with stacked headlights, Euro5, more power' }
		]
	},
	{
		brand: 'suzuki',
		family: 'SV650',
		reference: `${WP} "Suzuki SV650"`,
		generations: [
			{ from: 1999, to: 2002, reason: 'Carburetted first generation' },
			{ from: 2003, to: 2012, reason: 'Fuel injection, new frame' },
			{ from: 2016, reason: 'Returned as a new model after the Gladius years' }
		]
	},
	{
		brand: 'suzuki',
		family: 'Hayabusa',
		reference: `${WP} "Suzuki Hayabusa"`,
		generations: [
			{ from: 1999, to: 2007, reason: 'First generation' },
			{ from: 2008, to: 2020, reason: 'Second generation, 1340 cc' },
			{ from: 2021, reason: 'Third generation, IMU electronics, restyled' }
		]
	},

	// --- Triumph -------------------------------------------------------------
	{
		brand: 'triumph',
		family: 'Street Triple 765',
		reference: `${WP} "Triumph Street Triple"; rated power step visible in the registry`,
		generations: [
			{ from: 2017, to: 2019, reason: 'Launch of the 765' },
			{ from: 2020, to: 2022, reason: 'Restyle, Euro5' },
			{ from: 2023, reason: 'Rated power 90.5 → 95.6 kW, new bodywork' }
		]
	},
	{
		brand: 'triumph',
		family: 'Street Triple 675',
		reference: `${WP} "Triumph Street Triple"`,
		generations: [
			{ from: 2007, to: 2012, reason: 'Original 675' },
			{ from: 2013, reason: 'New frame, low exhaust, ABS' }
		]
	},
	{
		brand: 'triumph',
		family: 'Speed Triple',
		reference: `${WP} "Triumph Speed Triple"`,
		generations: [
			{ from: 2005, to: 2010, reason: '1050 cc, new bodywork' },
			{ from: 2011, to: 2015, reason: 'Restyle, angular headlights' },
			{ from: 2016, reason: 'Revised engine and electronics, ride-by-wire' }
		]
	},
	{
		brand: 'triumph',
		family: 'Tiger 800',
		reference: `${WP} "Triumph Tiger 800"`,
		generations: [
			{ from: 2010, to: 2014, reason: 'Launch model' },
			{ from: 2015, to: 2017, reason: 'XR/XC ranges, ride-by-wire, traction control' },
			{ from: 2018, reason: 'Major update: TFT, LED, revised engine' }
		]
	},
	{
		brand: 'triumph',
		family: 'Tiger 900',
		reference: 'Triumph model-year 2024 launch',
		generations: [
			{ from: 2020, to: 2023, reason: 'Launch model' },
			{ from: 2024, reason: 'More power, new TFT, revised suspension' }
		]
	},
	{
		brand: 'triumph',
		family: 'Tiger 1200',
		reference: `${WP} "Triumph Tiger 1200"`,
		generations: [
			{ from: 2018, to: 2021, reason: 'XC/XR range, 1215 cc' },
			{ from: 2022, reason: 'All new: 1160 cc T-plane triple, GT/Rally range' }
		]
	},

	// --- GasGas ----------------------------------------------------------------
	{
		brand: 'gasgas',
		family: 'EC 250',
		reference: `${WP} "Gas Gas" (Pierer Mobility takeover, 2019; KTM-based range from model year 2021)`,
		generations: [
			{
				from: 2021,
				reason:
					'Built on the KTM 250 EXC platform after the Pierer takeover: new frame, engine and bodywork; the Spanish-built EC 250 before it is a different machine'
			}
		]
	},

	// --- KTM -----------------------------------------------------------------
	{
		brand: 'ktm',
		family: '1290 Super Duke R',
		reference: `${WP} "KTM 1290 Super Duke R"`,
		generations: [
			{ from: 2013, to: 2016, reason: 'Launch model' },
			{ from: 2017, to: 2019, reason: 'Restyle, TFT dash, revised electronics' },
			{ from: 2020, reason: 'New frame and bodywork; replaced by the 1390 in 2024' }
		]
	},
	{
		brand: 'ktm',
		family: '1290 Super Adventure S',
		reference: 'KTM model-year 2021 launch',
		generations: [
			{ from: 2017, to: 2020, reason: 'Launch model' },
			{ from: 2021, reason: 'New frame, split fuel tank, radar cruise' }
		]
	},
	{
		brand: 'ktm',
		family: '1290 Super Duke GT',
		reference: 'KTM model-year 2019 launch',
		generations: [
			{ from: 2016, to: 2018, reason: 'Launch model' },
			{ from: 2019, reason: 'Restyle, TFT dash, revised suspension' }
		]
	},
	{
		brand: 'ktm',
		family: '390 Duke',
		reference: `${WP} "KTM 390 Duke"`,
		generations: [
			{ from: 2013, to: 2016, reason: 'Launch model' },
			{ from: 2017, to: 2023, reason: 'New bodywork, TFT dash, ride-by-wire' },
			{ from: 2024, reason: 'All new: 399 cc engine, new frame' }
		]
	},
	{
		brand: 'ktm',
		family: '125 Duke',
		reference: `${WP} "KTM 125 Duke"`,
		generations: [
			{ from: 2011, to: 2016, reason: 'Launch model' },
			{ from: 2017, to: 2023, reason: 'New bodywork, TFT dash' },
			{ from: 2024, reason: 'All new frame and bodywork' }
		]
	},

	// --- Ducati --------------------------------------------------------------
	{
		brand: 'ducati',
		family: 'Panigale V4',
		reference: `${WP} "Ducati Panigale V4"`,
		generations: [
			{ from: 2018, to: 2019, reason: 'Launch model' },
			{ from: 2020, to: 2021, reason: 'Winglets, revised chassis' },
			{ from: 2022, to: 2024, reason: 'Revised engine and ergonomics' },
			{ from: 2025, reason: 'All new: double-sided swingarm, new bodywork' }
		]
	},
	{
		brand: 'ducati',
		family: 'Scrambler 800',
		reference: 'Ducati model-year 2023 launch',
		generations: [
			{ from: 2015, to: 2022, reason: 'First generation' },
			{ from: 2023, reason: 'Second generation: lighter, ride-by-wire, TFT' }
		]
	},
	{
		brand: 'ducati',
		family: 'Monster 1200',
		reference: `${WP} "Ducati Monster 1200"`,
		generations: [
			{ from: 2014, to: 2016, reason: 'Launch model' },
			{ from: 2017, reason: 'Restyle, revised chassis' }
		]
	},

	// --- Others --------------------------------------------------------------
	{
		brand: 'royalenfield',
		family: 'Himalayan',
		reference: `${WP} "Royal Enfield Himalayan"; capacity step visible in the registry`,
		generations: [
			{ from: 2017, to: 2023, reason: '411 cc air-cooled' },
			{ from: 2024, reason: '452 cc liquid-cooled Sherpa engine; all new' }
		]
	}

	// Reviewed and deliberately left as UNKNOWN, because the generation history
	// is not established well enough to state:
	//   Piaggio Vespa GTS (continuous restyles), Yamaha FZS600 and XJ 6, Suzuki
	//   GSX-R750 and GSX-R600 (K-series splits vary by source), Suzuki VL800,
	//   Honda CBF 600 SA, Yamaha FZ6 and FZ1, Ducati Monster (one registry name
	//   across every displacement), BMW K 1600 GT, Honda CRF1100L Africa Twin
	//   (2024 changes were revisions), Yamaha RJ 07 (a type code needing an alias
	//   first).
];

/** The curated entry for a family, if there is one. */
export function findCuratedGenerations(
	brand: string,
	family: string
): CuratedFamilyGenerations | undefined {
	const wanted = normalise(family);
	return CURATED_GENERATIONS.find(
		(entry) => entry.brand === brand && normalise(entry.family) === wanted
	);
}

/** Which curated generation a year falls in. */
export function generationForYear(
	entry: CuratedFamilyGenerations,
	year: number
): CuratedGeneration | undefined {
	return entry.generations.find((g) => year >= g.from && year <= (g.to ?? Infinity));
}

const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

// ---------------------------------------------------------------------------
// Planning a family's generations
// ---------------------------------------------------------------------------

export type BoundarySource = 'CURATED' | 'DETECTED' | 'UNKNOWN';

export interface GenerationSpan {
	from: number;
	to: number;
	source: BoundarySource;
	reason?: string;
	reference?: string;
}

/**
 * A year of pre-registration ahead of a curated launch year is normal — a 2014
 * model is on the road in late 2013 — and is folded into the generation. Any
 * more than that is unexplained and becomes its own UNKNOWN span.
 */
const PRE_REGISTRATION_TOLERANCE = 1;

/**
 * Decides how a family's years divide into generations.
 *
 * Three sources, in order of trust, each applied only where the one above is
 * silent: curated boundaries where a human has established them; detected
 * boundaries where the registry's own numbers show an engine change; and one
 * UNKNOWN span for everything else. The result always covers every observed
 * year exactly once.
 */
export function planGenerations(input: {
	curated?: CuratedFamilyGenerations;
	observations: readonly YearObservation[];
	/** Fallback years when there are no per-year observations. */
	era?: { from?: number; to?: number };
}): GenerationSpan[] {
	// Only years with registrations in meaningful numbers: one 1999 example
	// registered under a name reused in 2021 does not make the 2021 machine
	// twenty years old.
	const years = meaningfulYears(input.observations);

	const first = years[0] ?? input.era?.from;
	const last = years[years.length - 1] ?? input.era?.to ?? first;
	if (first === undefined || last === undefined) return [];

	// Without curation: detected where possible, otherwise unknown.
	if (!input.curated) return uncurated(input.observations, first, last);

	const spans: GenerationSpan[] = [];
	const curated = [...input.curated.generations].sort((a, b) => a.from - b.from);

	let cursor = first;
	for (const [index, gen] of curated.entries()) {
		const next = curated[index + 1];
		// A curated generation runs to the year before the next one, or to the
		// end of what has been observed.
		const to = gen.to ?? (next ? next.from - 1 : Math.max(last, gen.from));
		let from = gen.from;

		if (cursor < from) {
			if (from - cursor <= PRE_REGISTRATION_TOLERANCE) {
				from = cursor;
			} else {
				// Years before this curated generation that nobody has divided.
				spans.push(...uncurated(input.observations, cursor, from - 1));
			}
		}
		if (to < cursor) continue;

		// A curated generation is about how the machine looks. An engine change
		// inside it means either the curation is wrong or two machines share the
		// name in the registry — either way, blending them would be worse than
		// dividing them, so the registry's evidence splits the span as well.
		const inside = input.observations.filter((o) => o.year >= from && o.year <= to);
		const steps = detectBoundaries(inside).filter((b) => b.reason.includes('capacity'));
		let pieceFrom = from;
		for (const step of steps) {
			spans.push({
				from: pieceFrom,
				to: step.year - 1,
				source: pieceFrom === from ? 'CURATED' : 'DETECTED',
				reason: pieceFrom === from ? gen.reason : spans[spans.length - 1].reason,
				reference: pieceFrom === from ? input.curated.reference : undefined
			});
			pieceFrom = step.year;
		}
		spans.push({
			from: pieceFrom,
			to,
			source: pieceFrom === from ? 'CURATED' : 'DETECTED',
			reason: pieceFrom === from ? gen.reason : steps[steps.length - 1].reason,
			reference: pieceFrom === from ? input.curated.reference : undefined
		});
		cursor = to + 1;
	}

	if (cursor <= last) spans.push(...uncurated(input.observations, cursor, last));

	// Only spans that actually have years in them. A curated generation nobody
	// has registered yet is a fact about the model, not a card to show.
	return spans.filter((span) => years.some((y) => y >= span.from && y <= span.to));
}

/** Spans for a range of years with no curation: detected steps, else one unknown. */
function uncurated(
	observations: readonly YearObservation[],
	from: number,
	to: number
): GenerationSpan[] {
	const inRange = observations.filter((o) => o.year >= from && o.year <= to);
	const boundaries = detectBoundaries(inRange);

	if (!boundaries.length) return [{ from, to, source: 'UNKNOWN' }];

	return toSpans(
		[
			...inRange,
			// Anchor the ends so the spans cover the whole range asked for.
			...(inRange.some((o) => o.year === from) ? [] : [{ year: from, registrationCount: 0 }]),
			...(inRange.some((o) => o.year === to) ? [] : [{ year: to, registrationCount: 0 }])
		],
		boundaries
	).map((span) => ({
		from: span.from,
		to: span.to,
		source: 'DETECTED' as const,
		reason: span.reason
	}));
}
