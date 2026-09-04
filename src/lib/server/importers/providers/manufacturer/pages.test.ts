import { describe, expect, it } from 'vitest';
import {
	pageNames,
	parseHondaPage,
	parseBmwPages,
	parseKawasakiPage,
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

const KAWASAKI = `<title>Versys 650 | 2026 | Kawasaki</title>
<img src="/content/dam/products/pim/gallery/j/Resource_322174_26KLE650H_J_44TBU1AFA2CG_C.jpg/jcr:content/renditions/cq5dam.web.1280.1280.png">
<img src="/content/dam/products/pim/studio/j/Resource_320369_26KLE650H_J_44TBU1DRF3CG_A.jpg/jcr:content/renditions/cq5dam.web.1280.1280.png">
<img src="/content/dam/products/pim/studio/j/Resource_320370_26KLE650H_J_44TBU1DRS3CG_A.jpg">
<img src="/content/dam/products/pim/studio/low/Resource_317406_999942147MA_Low_Seat_Front_BLK_Z900_25ZR900S_40SGN1FOSEA3CG_A.jpg">
<div class="price"><span>Vanaf</span><span class="amount">€9.149,00</span></div>
<table><tr><th scope="row" class="prodspecs__h">Cilinderinhoud (cm3)</th><td>649 cm³</td></tr>
<tr><th scope="row" class="prodspecs__h">Maximum vermogen</th><td>49,0 kW {67 PS} / 8.500 rpm</td></tr>
<tr><th scope="row" class="prodspecs__h">Maximum koppel</th><td>61,0 N·m {6,2 kgf·m} / 7.000 rpm</td></tr>
<tr><th scope="row" class="prodspecs__h">Wielbasis</th><td>1.415 mm</td></tr>
<tr><th scope="row" class="prodspecs__h">Zithoogte</th><td>845 mm</td></tr>
<tr><th scope="row" class="prodspecs__h">Rijklaargewicht*</th><td>219 kg</td></tr>
<tr><th scope="row" class="prodspecs__h">Geschat drooggewicht**</th><td>200 kg</td></tr></table>`;

describe('parseKawasakiPage', () => {
	it('reads the model year from the title and the specification rows', () => {
		const specs = parseKawasakiPage(KAWASAKI);
		expect(specs.modelYear).toBe(2026);
		expect(specs.displacementCc).toBe(649);
		expect(specs.powerKw).toBe(49);
		expect(specs.powerHp).toBe(67);
		expect(specs.torqueNm).toBe(61);
		expect(specs.wheelbaseMm).toBe(1415);
		expect(specs.seatHeightMm).toBe(845);
		expect(specs.wetWeightKg).toBe(219);
		expect(specs.dryWeightKg).toBe(200);
		expect(specs.priceEur).toBe(9149);
	});

	it('prefers the studio side view of the right model year, never an accessory shot', () => {
		const specs = parseKawasakiPage(KAWASAKI);
		expect(specs.image?.url).toBe(
			'https://www.kawasaki.nl/content/dam/products/pim/studio/j/Resource_320370_26KLE650H_J_44TBU1DRS3CG_A.jpg/jcr:content/renditions/cq5dam.web.1280.1280.png'
		);
		expect(specs.image?.modelYear).toBe(2026);
		expect(specs.image?.evidence).toContain('26KLE650H');
	});

	it('falls back to a gallery shot when there is no studio image', () => {
		const html = KAWASAKI.replace(/pim\/studio\/j\/[^"]*"/g, '"');
		const specs = parseKawasakiPage(html);
		expect(specs.image?.url).toContain('Resource_322174_26KLE650H');
	});

	it("accepts last year's photograph on a next-year page, with its own year", () => {
		const html = KAWASAKI.replace(/26KLE650H/g, '25KLE650H');
		const specs = parseKawasakiPage(html);
		expect(specs.modelYear).toBe(2026);
		expect(specs.image?.modelYear).toBe(2025);
		expect(specs.image?.evidence).toContain('25KLE650H');
	});

	it('takes no image two years old or from the future', () => {
		expect(parseKawasakiPage(KAWASAKI.replace(/26KLE650H/g, '24KLE650H')).image).toBeUndefined();
		expect(parseKawasakiPage(KAWASAKI.replace(/26KLE650H/g, '27KLE650H')).image).toBeUndefined();
	});

	it('reads a three-digit colour code', () => {
		const html = `<title>W230 | 2026 | Kawasaki</title>
<img src="/content/dam/products/pim/gallery/Resource_320383_26BJ230A_141GN1ARS2CG_C.jpg">`;
		expect(parseKawasakiPage(html).image?.evidence).toContain('26BJ230A');
	});

	it('confirms the page names the model', () => {
		expect(pageNames(KAWASAKI, 'Versys 650')).toBe(true);
		expect(pageNames(KAWASAKI, 'Ninja 650')).toBe(false);
	});
});

// Excerpts of https://www.bmw-motorrad.nl/nl/modellen/sport/s1000xr.html and its
// technicaldata.html as a browser received them on 2026-09-05.
const BMW_PAGE = `<title>BMW S 1000 XR | BMW Motorrad NL</title>
<meta property="og:image" content="https://www.bmw-motorrad.nl/content/dam/bmwmotorradnsc/common/multiimages/images/models/sport/s1000xr-2023/2026/productstage/nsc-s1000xr-P0N4V-multiimage-2560x1440.jpg.asset.1761723916306.jpg"/>
<div class="softconfiguratoritem_preview_image_loader">
  <div class="image-loader" data-id="ecd2d350" data-src="/content/dam/bmwmotorradnsc/common/images/models/sport/s1000xr-2023/2026/softconfigurator/nsc-s1000xr-P0N2U-softconfigurator-thumbnail.jpg.asset.1760014922787.jpg" data-alt="Blackstorm metallic 2">
</div></div>
<div class="softconfiguratoritem_product_image_loader">
  <div class="image-loader" data-src="/content/dam/bmwmotorradnsc/common/images/models/sport/s1000xr-2023/2026/softconfigurator/nsc-s1000xr-P0N2U-softconfigurator.jpg.asset.1760014923116.jpg" data-alt="De S 1000 XR in de basisuitvoering"></div>
  <div class="image-loader" data-src="/content/dam/bmwmotorradnsc/common/images/models/sport/s1000xr-2023/2026/softconfigurator/nsc-s1000xr-P0N4V-softconfigurator.jpg.asset.1760014923660.jpg" data-alt="The S 1000 XR in the M version"></div>
</div>
<div class="image-loader" data-src="/content/dam/bmwmotorradnsc/common/images/models/sport/s1000xr-2023/columnteaser/nsc-s1000xr-P0N3N-f900xr-columnteaser-1.jpg.asset.1697713953674.jpg" data-alt="De BMW F 900 XR"></div>
<div class="image-loader" data-src="/content/dam/bmwmotorradnsc/common/images/models/sport/f900xr/2026/softconfigurator/nsc-f900xr-P0N3N-softconfigurator.jpg.asset.1.jpg" data-alt="De BMW F 900 XR"></div>`;

const BMW_SPECS = `<div class="table__row" role="row">
  <div role="cell" id="a-row" class="table__label">
    Nominaal vermogen
  </div>
  <div role="cell" aria-labelledby="a-row" class="table__value">
    125 kW (170 pk) bij 11.000 tpm
  </div>
</div>
<div class="table__row" role="row">
  <div role="cell" id="b-row" class="table__label"> Cilinderinhoud </div>
  <div role="cell" aria-labelledby="b-row" class="table__value"> 999 cc </div>
</div>
<div class="table__row" role="row">
  <div role="cell" id="c-row" class="table__label"> Max. koppel </div>
  <div role="cell" aria-labelledby="c-row" class="table__value"> 114 Nm bij 9.250 tpm </div>
</div>
<div class="table__row" role="row">
  <div role="cell" id="d-row" class="table__label"> Wielbasis </div>
  <div role="cell" aria-labelledby="d-row" class="table__value"> 1,541 mm </div>
</div>
<div class="table__row" role="row">
  <div role="cell" id="e-row" class="table__label"> Zithoogte, onbeladen </div>
  <div role="cell" aria-labelledby="e-row" class="table__value"> 850 mm (optie verlaging: 790 mm) </div>
</div>
<div class="table__row" role="row">
  <div role="cell" id="f-row" class="table__label"> Tankinhoud </div>
  <div role="cell" aria-labelledby="f-row" class="table__value"> 20 l </div>
</div>
<div class="table__row" role="row">
  <div role="cell" id="g-row" class="table__label"> Rijklaar gewicht, volgetankt/volgeladen </div>
  <div role="cell" aria-labelledby="g-row" class="table__value"> 227 kg <span class="table__footnotedata">1</span>
  </div>
</div>`;

describe('parseBmwPages', () => {
	it('takes the first configurator studio shot of this model, dated by its folder', () => {
		const specs = parseBmwPages(BMW_PAGE, BMW_SPECS, 's1000xr');
		expect(specs.image?.url).toBe(
			'https://www.bmw-motorrad.nl/content/dam/bmwmotorradnsc/common/images/models/sport/s1000xr-2023/2026/softconfigurator/nsc-s1000xr-P0N2U-softconfigurator.jpg.asset.1760014923116.jpg'
		);
		expect(specs.image?.modelYear).toBe(2026);
		expect(specs.image?.evidence).toContain('model year 2026');
		expect(specs.modelYear).toBe(2026);
	});

	it("never takes another model's picture from the page", () => {
		const specs = parseBmwPages(BMW_PAGE, '', 'f900xr');
		expect(specs.image?.url).toContain('nsc-f900xr-P0N3N-softconfigurator');
		expect(specs.image?.url).not.toContain('s1000xr');
		const only = BMW_PAGE.replace(/nsc-s1000xr-P0N[24][UV]-softconfigurator[^"]*/g, '');
		expect(parseBmwPages(only, '', 's1000xr').image?.url).toContain(
			'productstage/nsc-s1000xr-P0N4V'
		);
	});

	it('prefers a dated studio shot over an undated one, and reads a year folder with a suffix', () => {
		const html = `<div data-src="/content/dam/x/images/models/adventure/f800gs-2023/softconfigurator/nsc-f800gs-P0NB5-softconfigurator.jpg.asset.1.jpg"></div>
<div data-src="/content/dam/x/images/models/adventure/f800gs-2023/2026-2/softconfigurator/nsc-f800gs-P0N3N-softconfigurator.jpg.asset.2.jpg"></div>`;
		const specs = parseBmwPages(html, '', 'f800gs');
		expect(specs.image?.url).toContain('P0N3N');
		expect(specs.image?.modelYear).toBe(2026);
		const undated = parseBmwPages(html.split('\n')[0], '', 'f800gs');
		expect(undated.image?.modelYear).toBeUndefined();
		expect(undated.modelYear).toBeUndefined();
	});

	it('reads the specification rows, thousands either way, standard setting first', () => {
		const specs = parseBmwPages(BMW_PAGE, BMW_SPECS, 's1000xr');
		expect(specs.powerKw).toBe(125);
		expect(specs.powerHp).toBe(170);
		expect(specs.displacementCc).toBe(999);
		expect(specs.torqueNm).toBe(114);
		expect(specs.wheelbaseMm).toBe(1541);
		expect(specs.seatHeightMm).toBe(850);
		expect(specs.fuelCapacityL).toBe(20);
		expect(specs.wetWeightKg).toBe(227);
		expect(specs.priceEur).toBeUndefined();
	});
});
