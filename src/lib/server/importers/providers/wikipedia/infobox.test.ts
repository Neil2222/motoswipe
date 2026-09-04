import { describe, expect, it } from 'vitest';
import {
	parseCooling,
	parseDisplacementCc,
	parseEngineLayout,
	parseInfobox,
	parseLengthMm,
	parseMotorcycleMassKg,
	parseSeatHeightMm,
	parseWheelbaseMm,
	parseMassKg,
	parsePower,
	parseProductionYear,
	parseProductionYears,
	parseStillProduced,
	parseTorqueNm,
	parseTransmission,
	parseVolumeL,
	stripMarkup
} from './infobox';
import {
	deriveTags,
	inferRidingPosition,
	isNonRoad,
	isNotAMotorcycle,
	isGenericDescription,
	mapCategory,
	mapCategoryFromArticleCategories
} from './categories';
import { buildAttribution, deriveModel } from './wikipedia.provider';

/**
 * These are the tests that matter for the importer.
 *
 * Fetching from Wikipedia is not worth testing — the API is somebody else's
 * problem. Turning their wikitext into numbers is entirely our problem, and it
 * is exactly where an importer quietly produces garbage: a seat height of 31
 * (inches read as millimetres), a displacement of 4 (from "4-stroke"), a power
 * figure of 9500 (from the rpm).
 *
 * The fixture below is the real lead section of the Kawasaki Z900 article,
 * abbreviated.
 */
const Z900 = `{{Infobox motorcycle
| name = Kawasaki Z900
| image = Kawasaki Z900, green.jpg
| manufacturer = [[Kawasaki Heavy Industries Motorcycle & Engine|Kawasaki Motorcycle & Engine Company]]
| production = 2017–present
| predecessor = [[Kawasaki Z800]]
| class = [[Types of motorcycles#Standard|Standard]]
| engine = {{convert|948|cc|abbr=on}} [[Radiator (engine cooling)|liquid-cooled]] [[4-stroke]] [[Multivalve|16-valve]] [[DOHC]] [[Inline-four engine|inline-four]]
| bore_stroke = {{convert|73.4|x|56.0|mm|1|abbr=on}}
| compression = 11.8:1
| top_speed = {{convert|253|km/h|mph|0|abbr=on}}
| power = 92.2 kW (125 hp) @ 9500 rpm
| torque = 98.6 N·m @ 7700 rpm
| transmission = 6-speed [[Non-synchronous transmission|constant-mesh]], chain final drive
| wheelbase = {{convert|1450|mm|1|abbr=on}}
| seat_height = {{convert|795|mm|1|abbr=on}}
| dry_weight =
| wet_weight = {{convert|210|kg|lb|0|abbr=on}}
| fuel_capacity = {{convert|17|L|1|abbr=on}}
| related = [[Kawasaki Z1000]]
}}

'''Kawasaki Z900''' is a motorcycle.`;

describe('parseInfobox', () => {
	it('extracts the template fields', () => {
		const fields = parseInfobox(Z900);
		expect(fields).not.toBeNull();
		expect(fields!.name).toBe('Kawasaki Z900');
		expect(fields!.class).toContain('Standard');
	});

	it('keeps nested templates intact rather than splitting on their pipes', () => {
		// {{convert|73.4|x|56.0|mm|1|abbr=on}} contains five pipes. A naive
		// splitter would produce five bogus fields and lose the value.
		const fields = parseInfobox(Z900)!;
		expect(fields.bore_stroke).toBe('{{convert|73.4|x|56.0|mm|1|abbr=on}}');
		expect(fields.seat_height).toBe('{{convert|795|mm|1|abbr=on}}');
	});

	it('skips fields that are present but empty', () => {
		expect(parseInfobox(Z900)!.dry_weight).toBeUndefined();
	});

	it('stops at the end of the template, not the end of the article', () => {
		expect(parseInfobox(Z900)!.related).toBe('[[Kawasaki Z1000]]');
		expect(JSON.stringify(parseInfobox(Z900))).not.toContain('is a motorcycle');
	});

	it('returns null for an article with no infobox', () => {
		expect(parseInfobox("'''Something''' is a town in France.")).toBeNull();
	});

	it('handles the underscore and lowercase spellings of the template name', () => {
		expect(parseInfobox('{{infobox_motorcycle\n| name = X\n}}')).toEqual({ name: 'X' });
	});

	it('survives an unclosed template without hanging', () => {
		expect(parseInfobox('{{Infobox motorcycle\n| name = X')).toBeNull();
	});
});

describe('stripMarkup', () => {
	it('unwraps piped links to their label', () => {
		expect(stripMarkup('[[Inline-four engine|inline-four]]')).toBe('inline-four');
	});

	it('unwraps plain links', () => {
		expect(stripMarkup('[[DOHC]]')).toBe('DOHC');
	});

	it('flattens a convert template to a number and unit', () => {
		expect(stripMarkup('{{convert|948|cc|abbr=on}}')).toBe('948 cc');
	});

	it('removes references and maintenance templates', () => {
		expect(stripMarkup('253 km/h<ref name="x">Source</ref>{{citation needed|date=2024}}')).toBe(
			'253 km/h'
		);
	});

	it('removes HTML comments', () => {
		expect(stripMarkup('795 mm<!-- check this -->')).toBe('795 mm');
	});
});

describe('parseDisplacementCc', () => {
	it('reads a convert template', () => {
		expect(parseDisplacementCc('{{convert|948|cc|abbr=on}} liquid-cooled inline-four')).toBe(948);
	});

	it('reads a plainly typed value', () => {
		expect(parseDisplacementCc('649 cc parallel twin')).toBe(649);
	});

	it('handles a thousands separator', () => {
		expect(parseDisplacementCc('{{convert|1,170|cc|abbr=on}} boxer twin')).toBe(1170);
	});

	it('converts litres', () => {
		expect(parseDisplacementCc('1.8 L flat-six')).toBe(1800);
	});

	it('converts cubic inches, as American cruisers state them', () => {
		expect(parseDisplacementCc('{{convert|107|cuin|cc}} V-twin')).toBe(1753);
	});

	it('is not fooled by "4-stroke" or "16-valve"', () => {
		// The classic importer bug: a bare number next to unrelated words.
		expect(parseDisplacementCc('4-stroke 16-valve DOHC')).toBeUndefined();
	});

	it('rejects implausible values rather than storing them', () => {
		expect(parseDisplacementCc('5 cc')).toBeUndefined();
		expect(parseDisplacementCc('9000 cc')).toBeUndefined();
	});

	it('returns undefined for an absent field', () => {
		expect(parseDisplacementCc(undefined)).toBeUndefined();
	});
});

describe('parsePower', () => {
	it('reads both units when both are stated', () => {
		expect(parsePower('92.2 kW (125 hp) @ 9500 rpm')).toEqual({ hp: 125, kw: 92.2 });
	});

	it('is not confused by the rpm figure', () => {
		// 9500 must never end up as a power reading.
		const { hp, kw } = parsePower('92.2 kW (125 hp) @ 9500 rpm');
		expect(hp).toBeLessThan(300);
		expect(kw).toBeLessThan(300);
	});

	it('derives kW when only horsepower is given', () => {
		const { hp, kw } = parsePower('47 bhp');
		expect(hp).toBe(47);
		expect(kw).toBeCloseTo(35, 0);
	});

	it('derives horsepower when only kW is given', () => {
		const { hp, kw } = parsePower('{{convert|35|kW|hp}}');
		expect(kw).toBe(35);
		expect(hp).toBeCloseTo(47, 0);
	});

	it('accepts PS, as European sources use it', () => {
		expect(parsePower('125 PS').hp).toBe(125);
	});

	it('returns nothing for an unparseable field', () => {
		expect(parsePower('not available')).toEqual({});
		expect(parsePower(undefined)).toEqual({});
	});
});

describe('lengths, masses and volumes', () => {
	it('reads a seat height in millimetres', () => {
		expect(parseLengthMm('{{convert|795|mm|1|abbr=on}}')).toBe(795);
	});

	it('converts inches, which is the dangerous case', () => {
		// 31 in is 787 mm. Storing "31" would make every fit estimate nonsense.
		expect(parseLengthMm('{{convert|31|in|mm}}')).toBe(787);
	});

	it('reads a mass in kilograms', () => {
		expect(parseMassKg('{{convert|210|kg|lb|0|abbr=on}}')).toBe(210);
	});

	it('converts pounds', () => {
		expect(parseMassKg('windowsill links 476 lb')).toBeCloseTo(215.9, 0);
	});

	it('reads fuel capacity in litres', () => {
		expect(parseVolumeL('{{convert|17|L|1|abbr=on}}')).toBe(17);
	});

	it('converts US gallons', () => {
		expect(parseVolumeL('{{convert|4.5|USgal|L}}')).toBeCloseTo(17, 0);
	});

	it('reads torque in newton metres', () => {
		expect(parseTorqueNm('98.6 N·m @ 7700 rpm')).toBe(98.6);
	});

	it('converts pound-feet', () => {
		expect(parseTorqueNm('{{convert|73|lbft|Nm}}')).toBeCloseTo(99, 0);
	});
});

describe('parseEngineLayout', () => {
	const cases: [string, string, number | undefined][] = [
		['948 cc liquid-cooled inline-four', 'Inline-4', 4],
		['765 cc inline-three', 'Inline-3', 3],
		['1200 cc parallel-twin', 'Parallel-twin', 2],
		['1170 cc air/oil-cooled boxer twin', 'Boxer twin', 2],
		['1103 cc V4', 'V4', 4],
		['1250 cc V-twin', 'V-twin', 2],
		['690 cc single-cylinder', 'Single', 1]
	];

	for (const [input, configuration, cylinders] of cases) {
		it(`reads "${input}" as ${configuration}`, () => {
			expect(parseEngineLayout(input)).toEqual({ configuration, cylinders });
		});
	}

	it('prefers the more specific layout when both words appear', () => {
		// "inline-four" contains "four"; the compound must win.
		expect(parseEngineLayout('inline-four cylinder').configuration).toBe('Inline-4');
	});

	it('falls back to a written cylinder count', () => {
		expect(parseEngineLayout('649 cc four-cylinder engine').cylinders).toBe(4);
	});

	it('gives up rather than guessing', () => {
		expect(parseEngineLayout('an engine')).toEqual({});
	});
});

describe('parseCooling', () => {
	it('reads liquid cooling', () => {
		expect(parseCooling('948 cc liquid-cooled inline-four')).toBe('Liquid');
	});

	it('reads air cooling', () => {
		expect(parseCooling('883 cc air-cooled V-twin')).toBe('Air');
	});

	it('distinguishes air/oil from plain air', () => {
		expect(parseCooling('1170 cc air/oil-cooled boxer')).toBe('Air/oil');
	});

	it('returns undefined when not stated', () => {
		expect(parseCooling('948 cc inline-four')).toBeUndefined();
	});
});

describe('parseTransmission', () => {
	it('reads gear count and final drive', () => {
		expect(parseTransmission('6-speed constant-mesh, chain final drive')).toEqual({
			transmission: '6-speed, Chain',
			gears: 6
		});
	});

	it('recognises shaft drive', () => {
		expect(parseTransmission('6-speed, shaft drive').transmission).toContain('Shaft');
	});

	it('recognises a CVT as having no gears', () => {
		expect(parseTransmission('CVT automatic')).toEqual({
			transmission: 'CVT (automatic)',
			gears: undefined
		});
	});

	it('rejects an implausible gear count', () => {
		expect(parseTransmission('99-speed').gears).toBeUndefined();
	});
});

describe('parseProductionYear', () => {
	it('takes the first year of a range', () => {
		expect(parseProductionYear('2017–present')).toBe(2017);
		expect(parseProductionYear('1969-1975')).toBe(1969);
	});

	it('reads a single year', () => {
		expect(parseProductionYear('2003')).toBe(2003);
	});

	it('rejects a number that is not a plausible year', () => {
		expect(parseProductionYear('1200 units')).toBeUndefined();
	});
});

describe('parseStillProduced', () => {
	it('treats "present" as still in production', () => {
		expect(parseStillProduced('2017–present')).toBe(true);
	});

	it('treats a closed range as discontinued', () => {
		expect(parseStillProduced('1969–1975')).toBe(false);
	});

	it('says nothing when it cannot tell', () => {
		expect(parseStillProduced('limited run')).toBeUndefined();
	});
});

describe('mapCategory', () => {
	it('refuses to classify a field that names a whole range', () => {
		// The Kawasaki Z750's infobox covers five kinds of motorcycle. Taking the
		// first match put a naked bike into the deck as a race replica.
		expect(mapCategory('Super Sports Tourer Adventure Bobber Cruiser')).toEqual({
			category: 'OTHER',
			categoryRaw: 'Super Sports Tourer Adventure Bobber Cruiser'
		});
	});

	it('still classifies a field that names one kind of bike two ways', () => {
		// "Sport touring" matches SPORT_TOURING and nothing else contradicts it.
		expect(mapCategory('Sport touring').category).toBe('SPORT_TOURING');
		expect(mapCategory('Standard / naked').category).toBe('NAKED');
	});

	const cases: [string, string][] = [
		['[[Types of motorcycles#Standard|Standard]]', 'NAKED'],
		['Sport touring', 'SPORT_TOURING'],
		['Sportbike', 'SPORT'],
		['Supersport', 'SUPERSPORT'],
		['Cruiser', 'CRUISER'],
		['Bobber', 'BOBBER'],
		['Touring', 'TOURING'],
		['Adventure', 'ADVENTURE'],
		['Dual-sport', 'DUAL_SPORT'],
		['Supermoto', 'SUPERMOTO'],
		['Scooter', 'SCOOTER'],
		['Café racer', 'CAFE_RACER'],
		['Scrambler', 'SCRAMBLER'],
		['Naked bike', 'NAKED']
	];

	for (const [input, expected] of cases) {
		it(`maps "${input}" to ${expected}`, () => {
			expect(mapCategory(input).category).toBe(expected);
		});
	}

	it('prefers the compound term over its substring', () => {
		// "Sport touring" contains "sport"; the compound has to win.
		expect(mapCategory('Sport touring').category).toBe('SPORT_TOURING');
		expect(mapCategory('Hyper naked').category).toBe('HYPER_NAKED');
	});

	it('keeps the original wording so a gap is visible, not lost', () => {
		const result = mapCategory('Feet-forward recumbent');
		expect(result.category).toBe('OTHER');
		expect(result.categoryRaw).toBe('Feet-forward recumbent');
	});

	it('handles an absent class', () => {
		expect(mapCategory(undefined)).toEqual({ category: 'OTHER', categoryRaw: null });
	});
});

describe('inferRidingPosition', () => {
	it('infers only where the category makes it unambiguous', () => {
		expect(inferRidingPosition('CRUISER')).toBe('FEET_FORWARD');
		expect(inferRidingPosition('SUPERSPORT')).toBe('AGGRESSIVE');
		expect(inferRidingPosition('ADVENTURE')).toBe('UPRIGHT');
	});

	it('declines to guess for an unclassified motorcycle', () => {
		expect(inferRidingPosition('OTHER')).toBeUndefined();
	});
});

describe('deriveTags', () => {
	it('picks up drivetrain and era hints', () => {
		const tags = deriveTags({
			categoryRaw: 'Modern classic',
			engine: '1170 cc air/oil-cooled boxer',
			transmission: '6-speed, shaft drive'
		});
		expect(tags).toContain('shaft-drive');
		expect(tags).toContain('retro');
	});

	it('returns an empty list rather than noise', () => {
		expect(deriveTags({ engine: '649 cc twin' })).toEqual([]);
	});
});

describe('deriveModel', () => {
	it('strips the manufacturer from the front of the title', () => {
		expect(deriveModel('Kawasaki Z900', 'Kawasaki Heavy Industries')).toBe('Z900');
	});

	it('leaves a model that does not start with the brand alone', () => {
		expect(deriveModel('Africa Twin', 'Honda')).toBe('Africa Twin');
	});

	it('drops a disambiguating suffix', () => {
		expect(deriveModel('Honda Cub (motorcycle)', 'Honda')).toBe('Cub');
	});

	it('never returns an empty model', () => {
		expect(deriveModel('Ducati', 'Ducati')).toBe('Ducati');
	});
});

describe('buildAttribution', () => {
	it('credits the photographer and the licence', () => {
		const attribution = buildAttribution(
			{
				Artist: { value: '<a href="//commons.wikimedia.org/wiki/User:Someone">Someone</a>' },
				LicenseShortName: { value: 'CC BY-SA 4.0' }
			},
			'File:Kawasaki Z900.jpg'
		);
		expect(attribution).toContain('Someone');
		expect(attribution).toContain('CC BY-SA 4.0');
		expect(attribution).toContain('Wikimedia Commons');
		// The HTML must not survive into the database.
		expect(attribution).not.toContain('<a');
	});

	it('still credits Commons when the metadata is missing', () => {
		const attribution = buildAttribution(undefined, 'File:Something.jpg');
		expect(attribution).toContain('Wikimedia Commons');
		expect(attribution).toContain('File:Something.jpg');
	});
});

describe('the Z900 fixture, end to end', () => {
	it('produces the figures a rider would recognise', () => {
		const f = parseInfobox(Z900)!;
		expect(parseDisplacementCc(f.engine)).toBe(948);
		expect(parsePower(f.power)).toEqual({ hp: 125, kw: 92.2 });
		expect(parseTorqueNm(f.torque)).toBe(98.6);
		expect(parseLengthMm(f.seat_height)).toBe(795);
		expect(parseLengthMm(f.wheelbase)).toBe(1450);
		expect(parseMassKg(f.wet_weight)).toBe(210);
		expect(parseVolumeL(f.fuel_capacity)).toBe(17);
		expect(parseCooling(f.engine)).toBe('Liquid');
		expect(parseEngineLayout(f.engine)).toEqual({ configuration: 'Inline-4', cylinders: 4 });
		expect(mapCategory(f.class).category).toBe('NAKED');
		expect(parseProductionYear(f.production)).toBe(2017);
		expect(parseStillProduced(f.production)).toBe(true);
	});
});

describe('isNotAMotorcycle', () => {
	it('rejects an article about an engine', () => {
		// Wikidata files "BMW 247 engine" as a motorcycle model. It is a
		// powerplant, and a cylinder head has no business in a swipe deck.
		expect(
			isNotAMotorcycle('BMW 247 engine', ['Category:Motorcycle engines', 'Category:BMW engines'])
		).toBe(true);
	});

	it('rejects on the title alone when categories are unavailable', () => {
		expect(isNotAMotorcycle('Honda RC211V engine', [])).toBe(true);
	});

	it('keeps a motorcycle that merely mentions its engine', () => {
		expect(
			isNotAMotorcycle('Kawasaki Z900', ['Category:Motorcycles', 'Category:Motorcycle engines'])
		).toBe(false);
	});

	it('keeps an ordinary motorcycle', () => {
		expect(isNotAMotorcycle('Yamaha MT-09', ['Category:Standard motorcycles'])).toBe(false);
	});
});

describe('isNonRoad', () => {
	it('flags a racing class', () => {
		expect(isNonRoad('MotoGP prototype')).toBe(true);
		expect(isNonRoad('Racing motorcycle')).toBe(true);
	});

	it('flags a military machine from its article categories', () => {
		// The Zündapp KS 750 has no class field; only its categories give it away.
		expect(
			isNonRoad(undefined, [
				'Category:Military motorcycles',
				'Category:World War II military vehicles of Germany'
			])
		).toBe(true);
	});

	it('does not flag a café racer', () => {
		// "racer" must not trip the "race" rule — this is a road bike.
		expect(isNonRoad('Café racer')).toBe(false);
	});

	it('does not flag an ordinary road bike', () => {
		expect(isNonRoad('Standard', ['Category:Standard motorcycles'])).toBe(false);
	});

	it('does not flag a road bike whose engine set a record', () => {
		// The Triumph Tiger T110 is a 1953 road motorcycle that sits in
		// "Category:Land speed record motorcycles" because a streamliner used its
		// engine. Tagging it non-road removed a perfectly ordinary bike from every
		// default deck.
		expect(
			isNonRoad(undefined, [
				'Category:Land speed record motorcycles',
				'Category:Motorcycles introduced in the 1950s',
				'Category:Triumph Engineering motorcycles'
			])
		).toBe(false);
	});

	it('still flags a Grand Prix racer from its categories', () => {
		expect(isNonRoad(undefined, ['Category:Grand Prix motorcycles'])).toBe(true);
	});
});

describe('mapCategoryFromArticleCategories', () => {
	it('classifies from a category when the infobox has no class', () => {
		expect(mapCategoryFromArticleCategories(['Category:Sport bikes']).category).toBe('SPORT');
		expect(mapCategoryFromArticleCategories(['Category:Cruiser motorcycles']).category).toBe(
			'CRUISER'
		);
	});

	it('ignores categories that are not about the machine', () => {
		// "Motorcycles introduced in 1969" says nothing about the kind of bike.
		expect(
			mapCategoryFromArticleCategories(['Category:Motorcycles introduced in 1969']).category
		).toBe('OTHER');
	});

	it('ignores categories with no motorcycle noun at all', () => {
		expect(mapCategoryFromArticleCategories(['Category:1969 in sport']).category).toBe('OTHER');
	});
});

/**
 * The Yamaha MT-07 imported with no engine, no power and no weight, and was
 * tagged shaft-drive. Its article uses the richer markup that well-maintained
 * modern articles use — which is to say, the failure was concentrated in
 * exactly the motorcycles anyone actually wants to see.
 */
const MT07 = `{{Infobox motorcycle
| name = Yamaha MT-07
| manufacturer = [[Yamaha Motor Company]]
| production = 2014–present
| class = {{unbulleted list
  | [[Naked bike]]
  | [[standard motorcycle|standard]]
  }}
| engine = {{convert|689.6|–|655.6|cc|abbr=on}} [[Radiator (engine cooling)|liquid-cooled]] [[4-stroke]] 8-valve [[DOHC]] [[straight-twin engine|parallel-twin]] with balance shaft
| power = {{unbulleted list
  | {{convert|55|kW|hp PS|abbr=on|1}} @ 9,000&nbsp;rpm<ref name="telegraph"/>
  | {{convert|49.85|kW|hp PS|abbr=on|1}} @ 9,200&nbsp;rpm (rear wheel)
  }}
| torque = {{unbulleted list
  | {{convert|68|Nm|abbr=on}} @ 6,500&nbsp;rpm
  | {{convert|61.6|Nm|abbr=on}} @ 6,600&nbsp;rpm (rear wheel)
  }}
| transmission = 6-speed [[Non-synchronous transmission|constant mesh]], chain drive
| seat_height = {{convert|805|mm|abbr=on}}
| wet_weight = {{convert|182|kg|lb|abbr=on}}
}}`;

describe('list templates and range converts (the Yamaha MT-07 case)', () => {
	const fields = parseInfobox(MT07)!;

	it('keeps the contents of an {{unbulleted list}} rather than deleting it', () => {
		// The wrapper is furniture; the numbers inside it are the data.
		expect(stripMarkup(fields.power)).toContain('55');
		expect(stripMarkup(fields.power)).toContain('kW');
	});

	it('reads power out of a list of figures, taking the first', () => {
		const { hp, kw } = parsePower(fields.power);
		expect(kw).toBe(55);
		expect(hp).toBeCloseTo(74, 0);
	});

	it('reads torque out of a list of figures', () => {
		expect(parseTorqueNm(fields.torque)).toBe(68);
	});

	it('reads a displacement from a range convert', () => {
		// {{convert|689.6|–|655.6|cc}} — the unit is the fourth argument, not the
		// second. Reading args[1] gave the unit as an en dash and produced null.
		expect(parseDisplacementCc(fields.engine)).toBe(690);
	});

	it('still reads the rest of the engine description', () => {
		expect(parseCooling(fields.engine)).toBe('Liquid');
		expect(parseEngineLayout(fields.engine)).toEqual({
			configuration: 'Parallel-twin',
			cylinders: 2
		});
	});

	it('classifies from a list-wrapped class field', () => {
		expect(mapCategory(fields.class).category).toBe('NAKED');
	});

	it('reads the remaining measurements', () => {
		expect(parseLengthMm(fields.seat_height)).toBe(805);
		expect(parseMassKg(fields.wet_weight)).toBe(182);
	});

	it('does not mistake a balance shaft for shaft drive', () => {
		const tags = deriveTags({
			categoryRaw: mapCategory(fields.class).categoryRaw,
			engine: fields.engine,
			transmission: fields.transmission
		});
		expect(tags).not.toContain('shaft-drive');
		expect(tags).toContain('chain-drive');
	});
});

describe('stripMarkup — template handling', () => {
	it('unwraps nested templates innermost first', () => {
		expect(stripMarkup('{{ubl|{{convert|100|kg|lb}}|{{convert|200|kg|lb}}}}')).toContain('100 kg');
	});

	it('drops named parameters, which are formatting not content', () => {
		expect(stripMarkup('{{convert|795|mm|abbr=on|1}}')).toBe('795 mm');
	});

	it('turns a line break into a separator rather than joining words', () => {
		expect(stripMarkup('Japan<br />Indonesia')).toBe('Japan ; Indonesia');
	});

	it('drops citation furniture without eating the value', () => {
		expect(stripMarkup('{{convert|68|Nm}} @ 6,500 rpm<ref name="x"/>')).toBe('68 Nm @ 6,500 rpm');
	});

	it('terminates on unbalanced braces instead of looping', () => {
		expect(() => stripMarkup('{{convert|100|kg')).not.toThrow();
	});
});

/**
 * Every case below is a real infobox value that produced a visibly wrong number
 * in a live import. They are here so the numbers on a card stay believable.
 */
describe('measurements that were silently wrong', () => {
	it('reads a range as its lower bound, not as the precision argument', () => {
		// {{convert|790-800|mm|in|1|abbr=on}} rendered as "1 mm", because the
		// value search picked the first argument that looked like a number and
		// the range did not. The Kawasaki W650 had a seat height of 1 mm.
		expect(stripMarkup('{{convert|790-800|mm|in|1|abbr=on}}')).toBe('790 mm');
		expect(parseSeatHeightMm('{{convert|790-800|mm|in|1|abbr=on}}')).toBe(790);
		expect(parseSeatHeightMm('{{convert|760-840|mm|in|1|abbr=on}}')).toBe(760);
	});

	it('keeps a leading decimal point', () => {
		// {{convert|.79|m|in|1}} lost its point and became 79 m — the Honda P50
		// was listed with a seat height of 79,000 mm.
		expect(stripMarkup('{{convert|.79|m|in|1|abbr=on}}')).toBe('.79 m');
		expect(parseSeatHeightMm('{{convert|.79|m|in|1|abbr=on}}')).toBe(790);
	});

	it('never returns a negative measurement', () => {
		// "850-870 mm" matched the hyphen as a minus sign and the BMW R 1250 GS
		// came out at -870 mm.
		expect(parseSeatHeightMm('850-870 mm')).toBe(850);
		expect(parseLengthMm('850–870 mm')).toBe(850);
	});

	it('handles the ordinary forms exactly as before', () => {
		expect(parseSeatHeightMm('{{convert|795|mm|abbr=on}}')).toBe(795);
		expect(parseWheelbaseMm('{{convert|1455|mm|abbr=on}}')).toBe(1455);
		expect(parseLengthMm('{{convert|31|in|mm}}')).toBe(787);
	});

	it('reads a comma as a decimal point when that is what it is', () => {
		// The BMW S1000RR's infobox says "191,8 kg". Treating that comma as a
		// thousands separator made "191" unitless, and the parser moved on to the
		// "8" — the bike was listed at 8 kg.
		expect(parseMotorcycleMassKg('191,8 kg')).toBe(191.8);
		expect(parseMotorcycleMassKg('169,8 kg')).toBe(169.8);
	});

	it('still reads a comma as a thousands separator when that is what it is', () => {
		expect(parseDisplacementCc('1,000 cc')).toBe(1000);
		expect(parseLengthMm('1,455 mm')).toBe(1455);
	});

	it('discards a figure no motorcycle could have', () => {
		expect(parseMotorcycleMassKg('8 kg')).toBeUndefined();
		expect(parseMotorcycleMassKg('{{convert|191.8|kg|abbr=on}}')).toBe(191.8);
		// Better a blank field than a confident absurdity on a card.
		expect(parseSeatHeightMm('{{convert|79|m|abbr=on}}')).toBeUndefined();
		expect(parseSeatHeightMm('1 mm')).toBeUndefined();
		expect(parseWheelbaseMm('{{convert|107|m|abbr=on}}')).toBeUndefined();
		// ...but a real one survives untouched.
		expect(parseSeatHeightMm('{{convert|1.07|m|abbr=on}}')).toBeUndefined();
		expect(parseWheelbaseMm('{{convert|1.07|m|abbr=on}}')).toBe(1070);
	});
});

/**
 * Every string below is a real Wikidata description that reached a card. Under
 * a heading that already reads SUZUKI / GS500 / SPORT, none of them says
 * anything, and a reader who sees a description assumes somebody wrote it.
 */
describe('isGenericDescription', () => {
	it('drops a line that only restates the category', () => {
		for (const text of [
			'motorcycle',
			'Motorcycle',
			'type of motorcycle',
			'motorcycle model',
			'British motorcycle',
			'Honda motorcycle',
			'sport bike',
			'sport bike motorcycle',
			'racing motorcycle',
			'Underbone',
			'Naked bike model from Honda',
			'Sport bike model from Honda',
			'a type of motorcycle.',
			'superbike',
			'middleweight motorcycle',
			'model of standard motorcycle',
			// Describes the manufacturer, or the engine, rather than the machine.
			'UK motorcycle manufacturer',
			'Indian motorcycle brand',
			'motorcycle engine'
		]) {
			expect(isGenericDescription(text), text).toBe(true);
		}
	});

	it('treats a blank as nothing to show', () => {
		expect(isGenericDescription(null)).toBe(true);
		expect(isGenericDescription('   ')).toBe(true);
	});

	it('keeps a description that actually says something', () => {
		for (const text of [
			'A parallel-twin naked bike introduced at the 2017 Tokyo Motor Show.',
			"Honda's first production motorcycle with a six-cylinder engine",
			'Naked bike with a 689 cc parallel twin',
			'The first Japanese motorcycle to use a monocoque frame',
			'Sport bike that replaced the CBR600F'
		]) {
			expect(isGenericDescription(text), text).toBe(false);
		}
	});
});

describe('parseProductionYears', () => {
	it('reads a closed range', () => {
		// The reason generations can be told apart at all.
		expect(parseProductionYears('1976–1983')).toEqual({ from: 1976, to: 1983 });
		expect(parseProductionYears('1969-1975')).toEqual({ from: 1969, to: 1975 });
	});

	it('leaves an open range open', () => {
		expect(parseProductionYears('2017–present')).toEqual({ from: 2017 });
		expect(parseProductionYears('2020–')).toEqual({ from: 2020 });
		expect(parseProductionYears('2015 to date')).toEqual({ from: 2015 });
	});

	it('handles a single year', () => {
		expect(parseProductionYears('2003')).toEqual({ from: 2003 });
	});

	it('says nothing when there is no year in there', () => {
		expect(parseProductionYears('1200 units')).toEqual({});
		expect(parseProductionYears(undefined)).toEqual({});
	});
});
