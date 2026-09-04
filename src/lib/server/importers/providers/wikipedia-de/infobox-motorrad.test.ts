import { describe, expect, it } from 'vitest';
import { mapBauart, parseInfoboxMotorrad, parseLeistung, parseSitzhoehe } from './infobox-motorrad';
import { articleFiles, captionYear } from './wikipedia-de.provider';

// The real infobox of de.wikipedia "Kawasaki Z 900", trimmed.
const Z900 = `{{Infobox Motorrad
|Marke= Kawasaki
|Bild= KawasakiZ900.jpg
|Bildtext = Kawasaki Z 900, Baujahr 2017
|Modell= Z 900/Z 900 RS, seit 2017
|Hersteller= [[Kawasaki Heavy Industries|Kawasaki]]
|Produktion von= 2017
|Produktion bis=
|Klasse= [[Motorrad]]
|Bauart= [[Naked Bike]]
|Motor= [[Viertaktmotor|4-Takt]], Wassergekühlter [[Reihenmotor|Reihenvierzylinder]]
|Hubraum= 948
|Leistung= 92,2 / 125 bei 9500/min (Z 900)
|Drehmoment= 98,6 bei 7700/min (Z 900)
|Geschwindigkeit= 240<ref name="x">{{Internetquelle |url=https://example.org |titel=Test}}</ref>
|Gänge= 6-Gang
|Radstand= 1450 (Z 900 ab 2020 1455)<ref name="x" />
|Maße= 2.065 × 825 × 1.065
|Sitzhöhe= 79,5, ab 2020 82<ref name="x" />
|Vorgängermodell= [[Kawasaki Z 800|Z 800]]
}}
[[Datei:KawasakiZ900MJ2021.JPG|mini|Kawasaki Z 900, Baujahr 2021]]
[[Datei:Kawasaki Z900 FrontView-resized.jpg|mini|Z 900, Frontansicht]]
Die '''Kawasaki Z 900''' ist ein Motorrad.`;

describe('parseInfoboxMotorrad', () => {
	const fields = parseInfoboxMotorrad(Z900)!;

	it('reads the German conventions', () => {
		expect(fields.seatHeightMm).toBe(795);
		expect(fields.torqueNm).toBe(98.6);
		expect(fields.powerKw).toBe(92.2);
		expect(fields.powerHp).toBe(125);
		expect(fields.displacementCc).toBe(948);
		expect(fields.gears).toBe(6);
		expect(fields.wheelbaseMm).toBe(1450);
		expect(fields.productionFrom).toBe(2017);
		expect(fields.productionTo).toBeUndefined();
	});

	it('keeps the lead image and its caption', () => {
		expect(fields.image).toBe('KawasakiZ900.jpg');
		expect(captionYear(fields.imageCaption!)).toBe(2017);
	});

	it('maps Bauart onto a category without guessing', () => {
		expect(mapBauart(fields.bauart).category).toBe('NAKED');
		expect(mapBauart('[[Reiseenduro]]').category).toBe('ADVENTURE');
		expect(mapBauart('[[Allrounder (Motorrad)|Allrounder]]').category).toBe('NAKED');
		expect(mapBauart('Sporttourer').category).toBe('SPORT_TOURING');
		expect(mapBauart('Dreirad').category).toBe('OTHER');
		expect(mapBauart(undefined).category).toBe('OTHER');
	});
});

describe('an article covering several machines of one name', () => {
	it('takes the span the caption says the figures describe', () => {
		const wikitext = `{{Infobox Motorrad
| Marke = Kawasaki
| Bild = Kawasaki Z 400 (1978).jpg
| Modell = Z&nbsp;400
| Bildtext = Technische Daten: Modell 1973–1979
| Produktion von = 1973
| Produktion bis = 2023
| Hubraum = 398
| Leistung = 22 / 30 bei 9.000 min<sup>−1</sup> (Z 400 D)
}}`;
		const parsed = parseInfoboxMotorrad(wikitext);
		expect(parsed?.productionFrom).toBe(1973);
		expect(parsed?.productionTo).toBe(1979);
		expect(parsed?.powerKw).toBe(22);
	});
});

describe('the small parsers', () => {
	it('takes seat height in centimetres or millimetres', () => {
		expect(parseSitzhoehe('79,5, ab 2020 82')).toBe(795);
		expect(parseSitzhoehe('840 mm')).toBe(840);
		expect(parseSitzhoehe('80')).toBe(800);
		expect(parseSitzhoehe(undefined)).toBeUndefined();
	});

	it('reads kW / PS', () => {
		expect(parseLeistung('55 / 74,8 bei 9000/min')).toEqual({ kw: 55, hp: 74.8 });
		expect(parseLeistung('43/58 bei 6750/min')).toEqual({ kw: 43, hp: 58 });
		expect(parseLeistung('95 PS')).toEqual({ hp: 95, kw: undefined });
		expect(parseLeistung('70')).toEqual({ kw: 70 });
	});

	it('reads a number by the unit next to it, whichever comes first', () => {
		// The Bonneville T120 article: PS first, kW in brackets. This once read
		// as 80 kW, and the card said 59 hp.
		expect(parseLeistung('80 PS (59 kW) bei 6.550/min')).toEqual({ kw: 59, hp: 80 });
		// The Panigale V4 article: a rev figure with a thousands dot after the
		// unit-marked numbers. This once read as 13 kW.
		expect(parseLeistung('158,5 kW (215,5 PS) bei 13.000/min')).toEqual({ kw: 158.5, hp: 215.5 });
	});

	it('takes the unrestricted figure when a restricted version is listed too', () => {
		expect(parseLeistung('33 / 45 bei 10.000/min, A2: 26 / 35')).toEqual({ kw: 33, hp: 45 });
		expect(parseLeistung('35 kW (48 PS), gedrosselt 25 kW (34 PS)')).toEqual({ kw: 35, hp: 48 });
	});
});

describe('article photographs', () => {
	it('lists every file with its caption, and reads a Baujahr', () => {
		const files = articleFiles(Z900);
		expect(files).toHaveLength(2);
		expect(files[0]).toEqual({
			file: 'KawasakiZ900MJ2021.JPG',
			caption: 'Kawasaki Z 900, Baujahr 2021'
		});
		expect(captionYear(files[0].caption)).toBe(2021);
		expect(captionYear(files[1].caption)).toBeUndefined();
	});
});
