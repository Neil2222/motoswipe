import { describe, expect, it } from 'vitest';
import {
	pageNames,
	parseHondaPage,
	parseKtmPages,
	parseSuzukiPage,
	parseTriumphPage,
	parseYamahaPage
} from './pages';

// Fragments in the shape the three sites actually serve, cut down to the
// parts read. Values are the ones the live pages showed on 3 September 2026.

const HONDA = `<title>NC750X specificaties | Honda</title>
<picture><source data-srcset="/content/dam/central/motorcycles/colour-picker/scooter/cuve/cuve_2025/x/25YM_CUVe_Studio_RHS.png/jcr:content/renditions/m_w.webp"></picture>
<picture><source data-srcset="/content/dam/central/motorcycles/colour-picker/adventure/nc750x/nc750x_mt_2026/nh-d05/26YM_NC750X_MAT_MT_RHS.png/jcr:content/renditions/m_w.webp"></picture>
<div data-variant-name="NC750X 2026" data-price="9.799 €"></div>
<div data-variant-name="NC750X DCT 2026" data-price="10.899 €"></div>
<div data-variant-name="NC750X 2027" data-price=""></div>
<ul><li class="item"><h5>Zithoogte (mm)</h5><p>802 mm</p></li>
<li class="item"><h5>Max. koppel</h5><p>69 Nm @ 4.750 tpm</p></li>
<li class="item"><h5>Rijklaargewicht (kg)</h5><p>216kg</p></li>
<li class="item"><h5>Max. vermogen</h5><p>43,1 kW @ 6.750 tpm</p></li>
<li class="item"><h5>Cilinderinhoud</h5><p>745 cc</p></li></ul>`;

const SUZUKI = `<title>GSX-8S | Suzuki</title>
<meta property="og:image" content="https://www.suzuki.nl/images/abc/Suzuki_GSX800RQM3_action_147_header.jpg">
<table><tr><td class="table-header">Cilinderinhoud (cm3)</td><td class="table-content">776</td></tr>
<tr><td class="table-header">Zithoogte mm</td><td class="table-content">810</td></tr>
<tr><td class="table-header">Koppel Nm/t.p.m.</td><td class="table-content">78 / 6.800</td></tr>
<tr><td class="table-header">Vermogen pk/t.p.m.</td><td class="table-content">83 / 8.500</td></tr>
<tr><td class="table-header">Gewicht rijklaar kg</td><td class="table-content">202</td></tr></table>
<p>Financial lease vanaf € 16.999</p>`;

const YAMAHA = `<title>MT-07 | Yamaha</title>
<meta property="og:image" content="https://cdn2.yamaha-motor.eu/prod/product-assets/2025/MT07A/2025-Yamaha-MT07A-EU-Ice_Storm-Action-001-03.jpg">`;

describe('pageNames', () => {
	it('confirms the page is about the model before anything is read', () => {
		expect(pageNames(HONDA, 'NC750X')).toBe(true);
		expect(pageNames(HONDA, 'CB750 Hornet')).toBe(false);
		expect(pageNames(SUZUKI, 'GSX-8S')).toBe(true);
	});
});

describe('parseHondaPage', () => {
	const specs = parseHondaPage(HONDA, 'NC750X');

	it('reads the specification items and the lowest variant price', () => {
		expect(specs).toMatchObject({
			seatHeightMm: 802,
			torqueNm: 69,
			powerKw: 43.1,
			wetWeightKg: 216,
			displacementCc: 745,
			priceEur: 9799,
			modelYear: 2026
		});
	});

	it("takes the model's own image, not the navigation's", () => {
		expect(specs.image?.url).toContain('/nc750x/');
		expect(specs.image?.modelYear).toBe(2026);
	});
});

describe('parseSuzukiPage', () => {
	const specs = parseSuzukiPage(SUZUKI);

	it('reads the table and the model year off the asset code', () => {
		expect(specs).toMatchObject({
			seatHeightMm: 810,
			torqueNm: 78,
			powerKw: 61.9,
			wetWeightKg: 202,
			displacementCc: 776,
			modelYear: 2023
		});
		expect(specs.image?.modelYear).toBe(2023);
	});

	it('does not read a financing figure as a list price', () => {
		expect(specs.priceEur).toBeUndefined();
	});
});

describe('parseYamahaPage', () => {
	it('reads the model year off the asset path', () => {
		expect(parseYamahaPage(YAMAHA).image).toMatchObject({ modelYear: 2025 });
		expect(parseYamahaPage('<title>x</title>')).toEqual({});
	});
});

describe('parseHondaPage asset folders', () => {
	const HTML = `<img src="/content/dam/central/motorcycles/colour-picker/adventure/crf1100l_at/crf1100l_at_mt_2026/r-380/26YM_CRF1100L_L1_MT_R-380_GrandPrixRed_RHS.png/jcr:content/renditions/c1_r.png">
<img src="/content/dam/central/motorcycles/colour-picker/adventure/crf1100l_atas/crf1100l_atas_dct_es_2026/nh-b53p/26YM_CRF1100L_L4_DCT_NH-B53P_PearlGlareWhite_RHS.png/jcr:content/renditions/c1_r.png">`;

	it('takes only the image filed under the curated folder, whole segment', () => {
		expect(
			parseHondaPage(HTML, 'CRF1100L Africa Twin Adventure Sports', 'crf1100l_atas').image?.url
		).toContain('/crf1100l_atas/');
		expect(parseHondaPage(HTML, 'CRF1100L Africa Twin', 'crf1100l_at').image?.url).toContain(
			'/crf1100l_at/'
		);
		expect(parseHondaPage(HTML, 'CRF1100L Africa Twin', 'crf1100l_at').image?.url).not.toContain(
			'atas'
		);
		expect(parseHondaPage(HTML, 'CRF1100L Africa Twin Adventure Sports').image).toBeUndefined();
	});
});

describe('parseTriumphPage', () => {
	const SPEC = `<table><tr><th scope="row" id="x-max.-vermogen-ec"> Max. vermogen EC </th><td headers="x"> 108 pk 79.5 kW bij 9500 t/min </td></tr>
<tr><th scope="row" id="x-max.-koppel-ec"> Max. koppel EC </th><td> 90 Nm bij 6850 tpm </td></tr>
<tr><th scope="row" id="x-zadelhoogte"> Zadelhoogte </th><td> Verstelbaar 820 - 840 mm </td></tr></table>
<table><tr><th scope="row" id="y-max.-vermogen-ec"> Max. vermogen EC </th><td> 130Pk / 128.2 BHP (95.6kW) @12000tpm </td></tr>
<tr><th scope="row" id="y-max.-koppel-ec"> Max. koppel EC </th><td> 80Nm@ 9500tpm </td></tr>
<tr><th scope="row" id="y-zadelhoogte"> Zadelhoogte </th><td> 836 mm </td></tr></table>`;
	const MODEL = `<img src="https://media.triumphmotorcycles.co.uk/image/upload/w_243,c_scale/f_auto/sitecoremedialibrary/media-library/images/motorcycles/tiger%20sport%20660%202025/my25-tiger-sport-660-article-hero-1920x1080.png">
<img src="https://media.triumphmotorcycles.co.uk/image/upload/f_auto/q_auto:eco/sitecoremedialibrary/media-library/images/motorcycles/my26%20colours/street%20triple/street-triple-r-my26-phantom-black-rhs-1080.png">`;

	it('reads every variant table: strongest power and torque, lowest seat setting', () => {
		expect(parseTriumphPage(SPEC, 'Tiger 900')).toMatchObject({
			seatHeightMm: 820,
			torqueNm: 90,
			powerKw: 95.6
		});
	});

	it("takes the model's own dated file and not another model's promotion", () => {
		const image = parseTriumphPage('', 'Street Triple 765', MODEL).image;
		expect(image?.modelYear).toBe(2026);
		expect(image?.url).toContain('street-triple-r-my26');
		expect(image?.url).toContain('w_1200');
		expect(parseTriumphPage('', 'Tiger 900', MODEL).image).toBeUndefined();
	});
});

describe('parseKtmPages', () => {
	const MODEL = `<meta property="og:title" content="2024 KTM 1290 Super Duke GT  - THE LONG DISTANCE BEAST | KTM Netherlands">
<meta property="og:image" content="https://azwecdnepstoragewebsiteuploads.azureedge.net/PHO_STAGE_KTM-sports-tourer-1290-super-duke-gt-2024-desktop-header.jpg">`;
	const SPEC = `<div class="c-technical-specifications-modal__content-row"><div class="c-technical-specifications-modal__content-col"> Seat height </div><div class="c-technical-specifications-modal__content-col"> 835 mm </div></div>
<div class="c-technical-specifications-modal__content-row"><div class="c-technical-specifications-modal__content-col"> Torque </div><div class="c-technical-specifications-modal__content-col"> 141 Nm </div></div>
<div class="c-technical-specifications-modal__content-row"><div class="c-technical-specifications-modal__content-col"> Weight (without fuel) </div><div class="c-technical-specifications-modal__content-col"> 209 kg </div></div>`;

	it('reads the model year from the page title and the rows from the specification page', () => {
		const specs = parseKtmPages(MODEL, SPEC);
		expect(specs).toMatchObject({
			modelYear: 2024,
			seatHeightMm: 835,
			torqueNm: 141,
			dryWeightKg: 209
		});
		expect(specs.wetWeightKg).toBeUndefined();
		expect(specs.image?.modelYear).toBe(2024);
	});

	it('refuses the site logo as an image', () => {
		const logo = MODEL.replace(
			/og:image" content="[^"]+"/,
			'og:image" content="https://x/37860_KTM_LogoPodium_orange_RGB"'
		);
		expect(parseKtmPages(logo, SPEC).image).toBeUndefined();
	});
});
