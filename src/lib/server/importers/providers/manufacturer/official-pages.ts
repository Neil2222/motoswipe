/**
 * The manufacturers' own model pages for the Dutch market.
 *
 * Each row names a family in the catalogue and the official page that
 * describes it today. What the page proves depends on the maker's site:
 *
 *  - **Honda NL** states the model year in its image paths ("26YM_…") and its
 *    variant names ("NC750X DCT 2026"), and lists the full specification and
 *    the list price. Everything is evidence of that model year.
 *  - **Suzuki NL** carries a specification table and an official image whose
 *    asset code ends in the model-year letter (…M5 = 2025).
 *  - **Yamaha NL** carries an official image under `/product-assets/<year>/`;
 *    the specifications are rendered client-side and are not read.
 *  - **Kawasaki NL** names the model year in the page title and URL, tabulates
 *    the specifications and price, and codes every product image with the
 *    model year and type ("26KLE650H").
 *  - **BMW Motorrad NL** files its configurator studio shots under
 *    `/images/models/<segment>/<model>[-<launch year>]/<model year>/softconfigurator/`
 *    and keeps a specification table on a `technicaldata.html` sibling page.
 *    The site refuses plain HTTP clients, so these pages are fetched with a
 *    real browser (Playwright); the HTML itself carries the asset paths.
 *
 * Curated and not discovered: a wrong page is a wrong photograph on the wrong
 * card, and the makers' sites are not consistent enough to trust a guess.
 * Rows are checked against what the page says about itself at fetch time, and
 * a page that no longer names the model is skipped.
 */

export type Maker = 'honda' | 'suzuki' | 'yamaha' | 'triumph' | 'ktm' | 'kawasaki' | 'bmw';

export interface OfficialPage {
	brand: string;
	/** The catalogue's canonical family name. */
	family: string;
	maker: Maker;
	url: string;
	/** A word the page must contain, so a redirected or replaced page is noticed. */
	expect: string;
	/** A second page carrying the specifications, where a maker splits them off. */
	specsUrl?: string;
	/**
	 * The folder the maker files this model's own images under, where it is an
	 * abbreviation the model name cannot be matched to ("crf1100l_atas").
	 */
	assetFolder?: string;
}

const honda = (family: string, path: string, expect = family): OfficialPage => ({
	brand: 'honda',
	family,
	maker: 'honda',
	url: `https://www.honda.nl/motorcycles/range/${path}`,
	expect
});
const suzuki = (family: string, path: string, expect = family): OfficialPage => ({
	brand: 'suzuki',
	family,
	maker: 'suzuki',
	url: `https://www.suzuki.nl/motoren/modellen/${path}/`,
	expect
});
const triumph = (family: string, path: string, expect = family): OfficialPage => ({
	brand: 'triumph',
	family,
	maker: 'triumph',
	url: `https://www.triumphmotorcycles.nl/motoren/${path}`,
	specsUrl: `https://www.triumphmotorcycles.nl/motoren/${path}/specification`,
	expect
});
/**
 * KTM names the model year in the page URL and title — "2024-ktm-1290-superdukegt"
 * — and keeps the specifications on a sibling page.
 */
const ktm = (family: string, path: string, expect = family): OfficialPage => ({
	brand: 'ktm',
	family,
	maker: 'ktm',
	url: `https://www.ktm.com/en-nl/models/${path}.html`,
	specsUrl: `https://www.ktm.com/en-nl/models/${path}/technical-specifications.html`,
	expect
});
/**
 * BMW Motorrad NL. `slug` is the model as BMW spells it in asset names
 * ("s1000xr"); every image taken must carry it. Only models whose card is
 * not yet eligible for discovery are listed: the site shows the current
 * model year only, so a page can prove nothing about an earlier generation.
 */
const bmw = (family: string, path: string, slug: string): OfficialPage => ({
	brand: 'bmw',
	family,
	maker: 'bmw',
	url: `https://www.bmw-motorrad.nl/nl/modellen/${path}.html`,
	specsUrl: `https://www.bmw-motorrad.nl/nl/modellen/${path}/technicaldata.html`,
	expect: family,
	assetFolder: slug
});
/**
 * Kawasaki names the model year in the page URL. The rows point at the 2026
 * pages, the ones with complete content this September; a 2027 page exists
 * for some models but is a preview.
 */
const kawasaki = (family: string, path: string, expect = family): OfficialPage => ({
	brand: 'kawasaki',
	family,
	maker: 'kawasaki',
	url: `https://www.kawasaki.nl/nl_nl/Motorcycles/${path}.html`,
	expect
});
const yamaha = (family: string, path: string, expect = family): OfficialPage => ({
	brand: 'yamaha',
	family,
	maker: 'yamaha',
	url: `https://www.yamaha-motor.eu/nl/nl/${path}/`,
	expect
});

export const OFFICIAL_PAGES: OfficialPage[] = [
	// --- Honda ---------------------------------------------------------------
	honda('NC750X', 'adventure/nc750x/specifications.html'),
	honda('XL750 Transalp', 'adventure/xl750_transalp/specifications-and-price.html', 'Transalp'),
	{
		...honda(
			'CRF1100L Africa Twin',
			'adventure/crf1100l-africa-twin/specifications-and-price.html',
			'Africa Twin'
		),
		assetFolder: 'crf1100l_at'
	},
	{
		...honda(
			'CRF1100L Africa Twin Adventure Sports',
			'adventure/crf1100l-africa-twin-adventure-sports/specifications-and-price.html',
			'Adventure Sports'
		),
		assetFolder: 'crf1100l_atas'
	},
	honda('X-ADV', 'adventure/x-adv/specifications.html', 'X-ADV'),
	honda('NX500', 'adventure/nx500/specifications-and-price.html'),
	honda('CRF300L', 'adventure/crf300l/specifications.html'),
	honda('CB750 Hornet', 'street/hornet/specifications-and-price.html', 'Hornet'),
	honda('CB1000 Hornet', 'street/cb1000-hornet/specifications-and-price.html', 'Hornet'),
	honda('CB650R', 'street/cb650r/specifications-and-price.html'),
	honda('CB500 Hornet', 'street/cb500-hornet/specifications-and-price.html', 'Hornet'),
	honda('CMX500 Rebel', 'street/cmx500-rebel/specifications-and-price.html', 'Rebel'),
	honda('CMX1100 Rebel', 'street/cmx1100-rebel/specifications.html', 'Rebel'),
	honda('CB300R', 'street/cb300r/specifications-and-price.html'),
	honda('CB125R', 'street/cb125r/specifications.html'),
	honda('GB350S', 'street/gb350s/specifications-and-price.html'),
	honda('CB1000F', 'street/cb1000f/specifications-and-price.html'),
	honda(
		'CBR1000RR Fireblade',
		'super-sport/cbr1000rr-r-fireblade/specifications-and-price.html',
		'Fireblade'
	),
	honda('CBR600RR', 'super-sport/cbr600rr/specifications-and-price.html'),
	honda('CBR650R', 'super-sport/cbr650r/specifications-and-price.html'),
	honda('CBR500R', 'super-sport/cbr500r/specifications-and-price.html'),
	honda('NT1100', 'touring/nt1100/specifications-and-price.html'),
	honda('Gold Wing', 'touring/gl1800-gold-wing/specifications-and-price.html', 'Gold Wing'),

	// --- Suzuki --------------------------------------------------------------
	suzuki('GSX-8S', 'street/gsx-8s'),
	suzuki('GSX-8R', 'supersport/gsx-8r'),
	suzuki('GSX-8T', 'street/gsx-8t'),
	suzuki('GSX-S1000', 'street/gsx-s1000'),
	suzuki('GSX-S1000GT', 'street/gsx-s1000gt', 'GSX-S1000GT'),
	suzuki('GSX-S1000GX', 'street/gsx-s1000gx', 'GSX-S1000GX'),
	suzuki('GSX-S950', 'street/gsx-s950'),
	suzuki('SV-7GX', 'street/sv-7gx', 'SV-7GX'),
	suzuki('V-Strom 800DE', 'adventure-sport/v-strom-800de', 'V-Strom 800DE'),
	suzuki('V-Strom 1050', 'adventure-sport/v-strom-1050', 'V-Strom 1050'),
	suzuki('GSX-R1000', 'supersport/gsx-r1000r', 'GSX-R1000'),
	suzuki('Hayabusa', 'supersport/hayabusa'),
	suzuki('Burgman 400', 'scooter/burgman-400', 'Burgman'),
	suzuki('Address 125', 'scooter/address-125', 'Address'),
	suzuki('DR-Z4S', 'adventure-sport/dr-z4s', 'DR-Z4S'),
	suzuki('DR-Z4SM', 'street/dr-z4sm', 'DR-Z4SM'),

	// --- Yamaha --------------------------------------------------------------
	yamaha('MT-07', 'products/motorcycles/hyper-naked/mt-07', 'MT-07'),
	yamaha('MT-09', 'products/motorcycles/hyper-naked/mt-09', 'MT-09'),
	yamaha('MT-10', 'products/motorcycles/hyper-naked/mt-10', 'MT-10'),
	yamaha('MT-03', 'products/motorcycles/hyper-naked/mt-03', 'MT-03'),
	yamaha('MT-125', 'products/motorcycles/hyper-naked/mt-125', 'MT-125'),
	yamaha('Tracer 9', 'products/motorcycles/sport-touring/tracer-9-gt', 'Tracer 9'),
	yamaha('Tracer 7', 'products/motorcycles/sport-touring/tracer-7', 'Tracer 7'),
	yamaha('YZF-R7', 'products/motorcycles/supersport/r7', 'R7'),
	yamaha('YZF-R9', 'products/motorcycles/supersport/r9', 'R9'),
	yamaha('YZF-R3', 'products/motorcycles/supersport/r3', 'R3'),
	yamaha('YZF-R125', 'products/motorcycles/supersport/r125', 'R125'),
	yamaha('YZF-R1', 'products/motorcycles/supersport/r1', 'R1'),
	yamaha('XSR900', 'products/motorcycles/sport-heritage/xsr900', 'XSR900'),
	yamaha('XSR700', 'products/motorcycles/sport-heritage/xsr700', 'XSR700'),
	yamaha('XSR125', 'products/motorcycles/sport-heritage/xsr125', 'XSR125'),

	// --- Triumph: the specification page of each current model ---------------
	triumph('Tiger 900', 'adventure/tiger-900'),
	triumph('Tiger 1200', 'adventure/tiger-1200'),
	triumph('Tiger Sport 660', 'adventure/tiger-sport-660'),
	triumph('Tiger Sport 800', 'adventure/tiger-sport-800'),
	triumph('Street Triple 765', 'roadsters/street-triple-765', 'Street Triple'),
	triumph('Speed Triple 1200', 'roadsters/speed-triple-1200', 'Speed Triple'),
	triumph('Trident 660', 'roadsters/trident', 'Trident'),
	triumph('Daytona 660', 'sport/daytona-660'),
	triumph('Speed 400', 'classic/speed-400'),
	triumph('Scrambler 400X', 'classic/scrambler-400-x', 'Scrambler 400'),
	triumph('Bonneville Bobber', 'classic/bonneville-bobber', 'Bobber'),
	triumph('Scrambler 1200', 'classic/bonneville-scrambler-1200', 'Scrambler 1200'),
	triumph('Speed Twin', 'classic/bonneville-speed-twin-1200', 'Speed Twin'),
	triumph('Speed Twin 900', 'classic/bonneville-speed-twin-900', 'Speed Twin'),

	// --- KTM: model page for the image and year, specification page for figures
	ktm('1290 Super Duke GT', 'sports-tourer/2024-ktm-1290-superdukegt', 'Super Duke GT'),
	ktm('1390 Super Duke R', 'naked-bike/2026-ktm-1390-superduker', 'Super Duke R'),
	ktm('990 Duke', 'naked-bike/2026-ktm-990-duke', '990 Duke'),
	ktm('790 Duke', 'naked-bike/2027-ktm-790-duke', '790 Duke'),
	ktm('390 Duke', 'naked-bike/2026-ktm-390-duke', '390 Duke'),
	ktm('125 Duke', 'naked-bike/2026-ktm-125-duke', '125 Duke'),
	ktm('890 SM T', 'sports-tourer/2026-ktm-890-smt', '890 SMT'),
	ktm('690 SMC R', 'supermoto/2026-ktm-690-smcr', '690 SMC R'),
	ktm('390 SMC R', 'supermoto/2026-ktm-390-smcr', '390 SMC R'),
	ktm('450 EXC-F', 'enduro/4-stroke/2027-ktm-450-excf', '450 EXC-F'),
	ktm('350 EXC-F', 'enduro/4-stroke/2027-ktm-350-excf', '350 EXC-F'),
	ktm('500 EXC-F', 'enduro/4-stroke/2027-ktm-500-excf', '500 EXC-F'),
	ktm('250 EXC-F', 'enduro/4-stroke/2027-ktm-250-excf', '250 EXC-F'),
	ktm('300 EXC', 'enduro/2-stroke/2027-ktm-300-exc', '300 EXC'),
	ktm('1390 Super Adventure S', 'adventure/2026-ktm-1390-superadventures', 'Super Adventure S'),
	ktm(
		'1390 Super Adventure S EVO',
		'adventure/2026-ktm-1390-superadventuresevo',
		'Super Adventure S EVO'
	),
	ktm('1390 Super Adventure R', 'adventure/2026-ktm-1390-superadventurer', 'Super Adventure R'),
	ktm('390 Adventure R', 'adventure/2026-ktm-390-adventurer', '390 Adventure R'),
	ktm('390 Adventure X', 'adventure/2026-ktm-390-adventurex', '390 Adventure X'),
	ktm('790 Adventure', 'adventure/2026-ktm-790-adventure', '790 Adventure'),
	ktm('890 Adventure R', 'adventure/2026-ktm-890-adventurer', '890 Adventure R'),

	// --- Kawasaki NL ------------------------------------------------------------
	kawasaki('Versys 650', 'Adventure_Tourer/Versys_650_2026'),
	kawasaki('Versys 1100', 'Adventure_Tourer/Versys_1100_2026'),
	kawasaki('Z900', 'Supernaked/Z900_2026'),
	kawasaki('Z650', 'Supernaked/Z650_2026'),
	kawasaki('Z500', 'Supernaked/Z500_2026'),
	kawasaki('Z125', 'Supernaked/Z125_2026'),
	kawasaki('Z1100', 'Supernaked/Z1100_2027'),
	kawasaki('Z H2', 'Supernaked/Zh2_2026'),
	kawasaki('Ninja 650', 'Sport_Tourer/Ninja_650_2026'),
	kawasaki('Ninja 1100SX', 'Sport_Tourer/Ninja_1100SX_2026'),
	kawasaki('Ninja 500', 'Supersport_Sport/Ninja_500_se_2026', 'Ninja 500'),
	kawasaki('Ninja 125', 'Supersport_Sport/Ninja_125_2026'),
	kawasaki('Ninja ZX-6R', 'Supersport_Sport/Ninja_ZX-6R_2027'),
	kawasaki('Ninja ZX-10R', 'Supersport_Sport/Ninja_ZX-10R_2026'),
	kawasaki('Ninja ZX-10RR', 'Supersport_Sport/Ninja_ZX-10RR_2026', 'ZX-10RR'),
	kawasaki('Z900RS', 'Retro_Sport/Z900RS_2026'),
	kawasaki('Z650RS', 'Retro_Sport/Z650RS_2026'),
	kawasaki('Vulcan S', 'Urban_Cruiser/vulcan_s_2026'),
	kawasaki('Eliminator', 'Urban_Cruiser/eliminator_500_2026', 'Eliminator'),
	kawasaki('KLE500', 'Adventure/KLE500_2026'),
	kawasaki('W230', 'Classic/W230_2026'),

	// --- BMW Motorrad NL (rendered browser; see the note above) ---------------
	bmw('S 1000 XR', 'sport/s1000xr', 's1000xr'),
	bmw('F 800 GS', 'adventure/f800gs', 'f800gs'),
	// Not the K 1600 B: its page shows model year 2027 and the catalogue's only
	// generation ends in 2025, so the picture would be a name match, not evidence.
	bmw('M 1000 XR', 'm/m1000xr', 'm1000xr')
];
