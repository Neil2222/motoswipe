import type { MotorcycleCategory } from '$lib/domain/enums';

/**
 * Generated placeholder artwork.
 *
 * The seed catalogue ships no photographs: we have no licence to redistribute
 * manufacturer press images, and inventing one would be worse than having none.
 * But a grid of grey "image missing" boxes would make the swipe deck — the
 * entire product — impossible to evaluate.
 *
 * So each motorcycle gets a deterministic technical illustration: a side
 * profile assembled from real motorcycle parts (wheels, engine, frame, tank,
 * seat and tail, forks, exhaust), proportioned per category, lit like a
 * workshop at night and tinted from a hash of its slug.
 *
 * It is honestly not a photograph — it says so in the corner — but a cruiser
 * looks like a cruiser and an adventure bike looks like an adventure bike, so
 * the swipe deck still reads at a glance.
 *
 * Real images replace these by inserting MotorcycleImage rows; nothing here has
 * to be removed first. See README, "Image strategy".
 */

/**
 * 2:3 portrait, and the bike is drawn across only ~76% of the width.
 *
 * Swipe cards are `object-fit: cover`, and a phone card is around 0.53:1 —
 * narrower than the image — so the browser crops the sides. At 2:3 that leaves
 * roughly 79% of the width visible, and keeping the bike inside 76% means the
 * wheels survive the crop on every viewport instead of being sliced off.
 */
const WIDTH = 1000;
const HEIGHT = 1500;
/** Fraction of WIDTH the motorcycle is allowed to occupy. See above. */
const BIKE_WIDTH_FRACTION = 0.76;

/** Everything below is drawn in this coordinate space. */
const VIEW = { w: 480, h: 300, ground: 252 };

function hash(input: string): number {
	let h = 0x811c9dc5;
	for (let i = 0; i < input.length; i++) {
		h ^= input.charCodeAt(i);
		h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
	}
	return h >>> 0;
}

/**
 * Deterministic accent per motorcycle, from a restrained palette rather than a
 * free hue rotation — arbitrary hues produce the lilacs and limes that make a
 * design look accidental.
 */
const ACCENTS = [
	'#ff6a1f', // sodium
	'#35d6e8', // cyan
	'#c9ced6', // chrome
	'#e04a5f', // deep red
	'#f0b429', // amber
	'#7f9dd6' // cold blue
];

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/**
 * A category's proportions. Everything is measured in VIEW units with the
 * front wheel on the right, which is how side profiles are conventionally
 * drawn.
 */
interface Proportions {
	rearX: number;
	frontX: number;
	rearR: number;
	frontR: number;
	/** Main frame spine. Lower number = taller bike. */
	spineY: number;
	/** Top of the fuel tank at its highest point. */
	tankTopY: number;
	/** Rearmost point of the tank / front of the seat. */
	tankRearX: number;
	/** Front of the tank, where it meets the headstock. */
	tankFrontX: number;
	/** Seat surface. A cruiser's is far lower than a supermoto's. */
	seatY: number;
	/** Rearmost point of the seat unit. */
	seatRearX: number;
	/** Top of the tail at the very back — high on a sportbike, flat on a bobber. */
	tailY: number;
	/** Handlebar height. */
	barY: number;
	/** Fork offset: how far forward the front hub sits from the headstock. */
	rake: number;
	engineTopY: number;
	engineBottomY: number;
	engineFrontX: number;
	engineRearX: number;
	fairing: 'none' | 'bikini' | 'full' | 'beak' | 'screen';
	exhaust: 'low' | 'high' | 'under' | 'shotgun';
	/** Rear luggage, for tourers and ADVs. */
	panniers?: boolean;
	/** Draw a small pillion pad behind the rider seat. */
	seatSteps?: boolean;
}

function proportionsFor(category: MotorcycleCategory): Proportions {
	const base: Proportions = {
		rearX: 116,
		frontX: 364,
		rearR: 48,
		frontR: 48,
		spineY: 158,
		tankTopY: 126,
		tankRearX: 244,
		tankFrontX: 330,
		seatY: 140,
		seatRearX: 128,
		tailY: 132,
		barY: 108,
		rake: 24,
		engineTopY: 160,
		engineBottomY: 214,
		engineFrontX: 320,
		engineRearX: 240,
		fairing: 'none',
		exhaust: 'low'
	};

	switch (category) {
		case 'SUPERSPORT':
			return {
				...base,
				rearR: 46,
				frontR: 46,
				spineY: 162,
				tankTopY: 132,
				seatY: 128,
				tailY: 108, // sportbike tails kick right up
				seatRearX: 138,
				barY: 148, // clip-ons, below the top yoke
				rake: 20,
				fairing: 'full',
				exhaust: 'under'
			};

		case 'SPORT':
			return {
				...base,
				spineY: 160,
				tankTopY: 130,
				seatY: 132,
				tailY: 116,
				barY: 136,
				fairing: 'full',
				exhaust: 'low',
				seatSteps: true
			};

		case 'HYPER_NAKED':
			return {
				...base,
				spineY: 156,
				tankTopY: 120,
				seatY: 132,
				tailY: 112,
				barY: 104,
				fairing: 'bikini',
				exhaust: 'high',
				seatSteps: true
			};

		case 'NAKED':
			return { ...base, seatSteps: true };

		case 'CRUISER':
			return {
				...base,
				rearX: 100,
				frontX: 386,
				rearR: 52,
				frontR: 50,
				spineY: 172,
				tankTopY: 142,
				tankRearX: 236,
				tankFrontX: 336,
				seatY: 176, // the defining cruiser trait: a very low seat
				seatRearX: 112,
				tailY: 172,
				barY: 116,
				rake: 44, // long raked forks
				engineTopY: 168,
				engineBottomY: 218,
				engineFrontX: 322,
				engineRearX: 228,
				exhaust: 'shotgun'
			};

		case 'BOBBER':
			return {
				...base,
				rearX: 104,
				frontX: 380,
				rearR: 54,
				frontR: 50,
				spineY: 174,
				tankTopY: 146,
				tankRearX: 250,
				tankFrontX: 330,
				seatY: 178,
				seatRearX: 156, // solo seat: nothing behind it
				tailY: 182,
				barY: 122,
				rake: 40,
				engineTopY: 170,
				engineBottomY: 220,
				engineFrontX: 318,
				engineRearX: 234,
				exhaust: 'shotgun'
			};

		case 'ADVENTURE':
			return {
				...base,
				rearR: 50,
				frontR: 60, // 19–21 inch front
				spineY: 138,
				tankTopY: 100,
				tankRearX: 248,
				tankFrontX: 336,
				seatY: 116,
				seatRearX: 120,
				tailY: 112,
				barY: 78,
				rake: 30,
				engineTopY: 142,
				engineBottomY: 196,
				fairing: 'beak',
				exhaust: 'high',
				panniers: true,
				seatSteps: true
			};

		case 'DUAL_SPORT':
			return {
				...base,
				rearR: 50,
				frontR: 62,
				spineY: 132,
				tankTopY: 98,
				tankRearX: 252,
				tankFrontX: 332,
				seatY: 110,
				seatRearX: 124,
				tailY: 104,
				barY: 72,
				rake: 32,
				engineTopY: 136,
				engineBottomY: 190,
				fairing: 'beak',
				exhaust: 'high'
			};

		case 'SUPERMOTO':
			return {
				...base,
				rearR: 48,
				frontR: 50,
				spineY: 128,
				tankTopY: 100,
				tankRearX: 258,
				tankFrontX: 328,
				seatY: 106,
				seatRearX: 138,
				tailY: 100,
				barY: 68,
				rake: 26,
				engineTopY: 132,
				engineBottomY: 186,
				engineFrontX: 312,
				engineRearX: 248,
				exhaust: 'high'
			};

		case 'TOURING':
		case 'SPORT_TOURING':
			return {
				...base,
				rearX: 108,
				frontX: 372,
				spineY: 152,
				tankTopY: 118,
				seatY: 134,
				seatRearX: 122,
				tailY: 130,
				barY: 96,
				fairing: 'screen',
				exhaust: 'low',
				panniers: true,
				seatSteps: true
			};

		case 'SCRAMBLER':
			return {
				...base,
				rearR: 50,
				frontR: 54,
				spineY: 148,
				tankTopY: 116,
				seatY: 130,
				seatRearX: 126,
				tailY: 128,
				barY: 92,
				exhaust: 'high'
			};

		case 'CAFE_RACER':
			return {
				...base,
				spineY: 158,
				tankTopY: 124,
				tankRearX: 250,
				seatY: 134,
				seatRearX: 140,
				tailY: 126, // small humped seat cowl
				barY: 138, // clip-ons
				exhaust: 'low'
			};

		case 'SCOOTER':
			return {
				...base,
				rearX: 136,
				frontX: 348,
				rearR: 34,
				frontR: 34,
				spineY: 186,
				tankTopY: 150,
				tankRearX: 200,
				tankFrontX: 268,
				seatY: 142,
				seatRearX: 146,
				tailY: 146,
				barY: 96,
				rake: 18,
				engineTopY: 196,
				engineBottomY: 224,
				engineFrontX: 240,
				engineRearX: 160,
				exhaust: 'low'
			};

		case 'CLASSIC':
		default:
			return {
				...base,
				rearR: 49,
				frontR: 49,
				spineY: 156,
				tankTopY: 124,
				seatY: 136,
				tailY: 134, // flat bench seat
				barY: 100,
				exhaust: 'low',
				seatSteps: true
			};
	}
}

// ---------------------------------------------------------------------------
// Parts
// ---------------------------------------------------------------------------

function wheel(cx: number, cy: number, r: number, accent: string): string {
	const spokes: string[] = [];
	for (let i = 0; i < 6; i++) {
		const a = (i * Math.PI) / 3 + 0.3;
		const inner = 9;
		spokes.push(
			`<line x1="${(cx + Math.cos(a) * inner).toFixed(1)}" y1="${(cy + Math.sin(a) * inner).toFixed(1)}" ` +
				`x2="${(cx + Math.cos(a) * (r - 13)).toFixed(1)}" y2="${(cy + Math.sin(a) * (r - 13)).toFixed(1)}" ` +
				`stroke="#454d58" stroke-width="4.5" stroke-linecap="round"/>`
		);
	}
	return `<g>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="#0c0f13"/>
    <circle cx="${cx}" cy="${cy}" r="${r - 1}" fill="none" stroke="#1c2027" stroke-width="2"/>
    <circle cx="${cx}" cy="${cy}" r="${r - 10}" fill="none" stroke="${accent}" stroke-width="2.5" opacity="0.55"/>
    <circle cx="${cx}" cy="${cy}" r="${r - 12}" fill="#15191f"/>
    ${spokes.join('')}
    <circle cx="${cx}" cy="${cy}" r="7" fill="#5a636f"/>
    <circle cx="${cx}" cy="${cy}" r="3" fill="#2a3038"/>
  </g>`;
}

/**
 * The bodywork, as one continuous silhouette.
 *
 * A real motorcycle profile is a single line: tail, over the seat, down into
 * the dip, up over the tank, then down to the headstock. Drawing the tank and
 * seat as separate shapes — which is what an earlier version did — reads as two
 * planks bolted to a frame, not as a motorcycle.
 *
 * Because the dip depth falls out of `seatY` vs `tankTopY`, a cruiser gets a
 * deep scoop and a supersport gets an almost flat line, for free.
 */
function bodyPath(p: Proportions): string {
	const {
		seatRearX: rx,
		tailY: ty,
		seatY: sy,
		tankRearX: trx,
		tankTopY: tty,
		tankFrontX: tfx,
		spineY: spine
	} = p;

	const humpX = rx + (trx - rx) * 0.26;
	const seatMidX = rx + (trx - rx) * 0.62;
	const tankMidX = trx + (tfx - trx) * 0.46;

	return `M ${rx - 4} ${spine - 2}
    C ${rx - 6} ${ty + 8}, ${rx + 4} ${ty}, ${humpX} ${ty + 1}
    C ${humpX + 16} ${ty + 2}, ${seatMidX - 14} ${sy - 2}, ${seatMidX} ${sy}
    L ${trx - 10} ${sy + 1}
    C ${trx + 4} ${sy}, ${tankMidX - 30} ${tty + 2}, ${tankMidX} ${tty}
    C ${tankMidX + 26} ${tty - 1}, ${tfx - 6} ${tty + 8}, ${tfx} ${tty + 20}
    L ${tfx + 3} ${spine - 4}
    C ${tankMidX} ${spine + 6}, ${seatMidX} ${spine + 8}, ${rx - 4} ${spine - 2} Z`;
}

/**
 * The dip between seat and tank, drawn as a shadow line. It is what makes the
 * silhouette read as "you sit there" rather than as an undifferentiated slab.
 */
function seatSeam(p: Proportions): string {
	const seatMidX = p.seatRearX + (p.tankRearX - p.seatRearX) * 0.62;
	return `<path d="M ${p.seatRearX + 12} ${p.tailY + 12} C ${seatMidX - 20} ${p.seatY + 4}, ${seatMidX} ${p.seatY + 3}, ${p.tankRearX - 6} ${p.seatY + 3}"
    fill="none" stroke="#0d1116" stroke-width="3" opacity="0.75"/>`;
}

/** Engine block with cooling fins, slung under the frame spine. */
function engine(p: Proportions, accent: string): string {
	const { engineFrontX: fx, engineRearX: rx, engineTopY: ty, engineBottomY: by } = p;
	const fins: string[] = [];
	const finCount = 4;
	for (let i = 1; i <= finCount; i++) {
		const y = ty + ((by - ty) * i) / (finCount + 1.6);
		fins.push(
			`<line x1="${rx + 8}" y1="${y.toFixed(1)}" x2="${fx - 6}" y2="${(y - 2).toFixed(1)}" stroke="#333a44" stroke-width="2"/>`
		);
	}

	return `<g>
    <path d="M ${rx} ${ty}
      L ${fx} ${ty - 4}
      L ${fx + 4} ${by - 22}
      C ${fx} ${by}, ${rx + 26} ${by + 4}, ${rx + 10} ${by - 6}
      L ${rx - 2} ${ty + 16} Z"
      fill="url(#engineMetal)" stroke="#3d444e" stroke-width="1.5" stroke-linejoin="round"/>
    ${fins.join('')}
    <circle cx="${(rx + fx) / 2 - 4}" cy="${by - 16}" r="7" fill="#20262e" stroke="${accent}" stroke-width="1.5" opacity="0.8"/>
  </g>`;
}

function exhaustPath(p: Proportions): string {
	const { engineFrontX: fx, engineRearX: rx, engineBottomY: by, rearX, rearR } = p;
	const hubY = VIEW.ground - rearR;

	switch (p.exhaust) {
		case 'under':
			// Under-seat / under-belly: a stubby can beneath the engine.
			return `<path d="M ${fx - 10} ${by - 8} C ${rx + 10} ${by + 10}, ${rearX + 40} ${by + 6}, ${rearX + 18} ${by - 2}"
        fill="none" stroke="#3a414b" stroke-width="9" stroke-linecap="round"/>`;
		case 'high':
			// Upswept can ending beside the tail.
			return `<path d="M ${fx - 8} ${by - 14} C ${rx} ${by + 4}, ${rearX + 46} ${hubY + 6}, ${rearX + 30} ${hubY - 26}"
          fill="none" stroke="#3a414b" stroke-width="8" stroke-linecap="round"/>
        <rect x="${rearX + 16}" y="${hubY - 44}" width="34" height="16" rx="8" fill="#434b56" transform="rotate(-16 ${rearX + 33} ${hubY - 36})"/>`;
		case 'shotgun':
			// Cruiser: long straight pipes running the length of the bike.
			return `<path d="M ${fx - 6} ${by - 16} C ${rx} ${by + 6}, ${rearX + 30} ${hubY + 14}, ${rearX - 18} ${hubY + 8}"
          fill="none" stroke="#4b535e" stroke-width="9" stroke-linecap="round"/>
        <path d="M ${fx - 10} ${by - 4} C ${rx} ${by + 16}, ${rearX + 30} ${hubY + 24}, ${rearX - 22} ${hubY + 18}"
          fill="none" stroke="#3d444e" stroke-width="8" stroke-linecap="round"/>`;
		default:
			// Low side-mounted muffler.
			return `<path d="M ${fx - 8} ${by - 10} C ${rx} ${by + 8}, ${rearX + 50} ${hubY + 12}, ${rearX + 22} ${hubY + 6}"
          fill="none" stroke="#3a414b" stroke-width="8" stroke-linecap="round"/>
        <rect x="${rearX - 6}" y="${hubY - 4}" width="40" height="17" rx="8" fill="#464e59"/>`;
	}
}

function fairingPart(p: Proportions, headX: number, headY: number, accent: string): string {
	const { frontX, frontR } = p;
	const hubY = VIEW.ground - frontR;

	switch (p.fairing) {
		case 'full':
			return `<path d="M ${headX - 4} ${headY - 16}
          C ${frontX + 6} ${headY - 10}, ${frontX + 16} ${headY + 30}, ${frontX + 8} ${hubY - 26}
          L ${headX + 4} ${hubY - 14}
          C ${headX - 6} ${headY + 40}, ${headX - 8} ${headY + 10}, ${headX - 4} ${headY - 16} Z"
          fill="url(#bodyMetal)" stroke="${accent}" stroke-width="1.5" stroke-opacity="0.5"/>
        <path d="M ${headX + 2} ${headY - 18} L ${frontX - 2} ${headY - 30} L ${frontX + 2} ${headY - 14} Z"
          fill="#20262e" opacity="0.9"/>`;
		case 'bikini':
			return `<path d="M ${headX - 2} ${headY - 22} L ${frontX - 6} ${headY - 26} C ${frontX + 4} ${headY - 6}, ${frontX} ${headY + 8}, ${headX + 6} ${headY + 10} Z"
          fill="url(#bodyMetal)" stroke="${accent}" stroke-width="1.5" stroke-opacity="0.45"/>`;
		case 'beak':
			// ADV beak plus a tall screen.
			return `<path d="M ${headX} ${headY + 26} L ${frontX + 14} ${headY + 40} L ${frontX + 10} ${headY + 52} L ${headX - 2} ${headY + 42} Z"
          fill="#2b323b" stroke="#3d444e" stroke-width="1.2"/>
        <path d="M ${headX + 2} ${headY - 8} L ${headX + 16} ${headY - 46} L ${frontX - 6} ${headY - 40} L ${frontX + 2} ${headY - 2} Z"
          fill="url(#bodyMetal)" stroke="${accent}" stroke-width="1.5" stroke-opacity="0.45"/>`;
		case 'screen':
			return `<path d="M ${headX - 2} ${headY - 6}
          C ${frontX} ${headY - 4}, ${frontX + 10} ${headY + 34}, ${frontX + 4} ${hubY - 20}
          L ${headX + 2} ${hubY - 12} Z"
          fill="url(#bodyMetal)" stroke="#3d444e" stroke-width="1.2"/>
        <path d="M ${headX + 4} ${headY - 8} L ${headX + 20} ${headY - 62} L ${frontX} ${headY - 54} L ${frontX + 2} ${headY - 4} Z"
          fill="${accent}" opacity="0.14" stroke="${accent}" stroke-width="1.5" stroke-opacity="0.4"/>`;
		default:
			return '';
	}
}

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

export interface PlaceholderOptions {
	seed: string;
	category: MotorcycleCategory;
	manufacturer: string;
	model: string;
	modelYear?: number | null;
}

export function renderPlaceholderSvg(options: PlaceholderOptions): string {
	const h = hash(options.seed);
	const accent = ACCENTS[h % ACCENTS.length];
	// A second, independent knob from the same hash so the light angle varies
	// as well as the colour.
	const lightX = 22 + ((h >> 8) % 56);
	const lean = (((h >> 16) % 5) - 2) * 0.12;

	const p = proportionsFor(options.category);
	const g = VIEW.ground;

	const rearHubY = g - p.rearR;
	const frontHubY = g - p.frontR;
	// Headstock: where the forks meet the frame. Sits behind and above the hub.
	const headX = p.frontX - p.rake;
	const headY = p.spineY - 32;

	const wordmark = escapeXml(options.manufacturer.toUpperCase());
	// Fill most of the frame: the bike is the subject, not an inset diagram.
	const scale = (WIDTH * BIKE_WIDTH_FRACTION) / VIEW.w;
	const bikeLeft = (WIDTH - VIEW.w * scale) / 2;
	// Stand the bike on a floor line at 70% height: low enough that the card's
	// name block sits under it, high enough not to be cropped by `object-fit`.
	const groundY = HEIGHT * 0.67;
	const bikeTop = groundY - g * scale;

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${escapeXml(`${options.manufacturer} ${options.model} illustration`)}">
  <defs>
    <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#151a20"/>
      <stop offset="48%" stop-color="#0b0e12"/>
      <stop offset="100%" stop-color="#06080a"/>
    </linearGradient>
    <radialGradient id="lamp" cx="${lightX}%" cy="16%" r="72%">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.26"/>
      <stop offset="42%" stop-color="${accent}" stop-opacity="0.06"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="bodyMetal" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#454e5a"/>
      <stop offset="40%" stop-color="#2a3038"/>
      <stop offset="100%" stop-color="#161a20"/>
    </linearGradient>
    <linearGradient id="engineMetal" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#39404a"/>
      <stop offset="100%" stop-color="#191d23"/>
    </linearGradient>
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.9"/>
    </linearGradient>
    <pattern id="grid" width="64" height="64" patternUnits="userSpaceOnUse">
      <path d="M64 0 L0 0 0 64" fill="none" stroke="#ffffff" stroke-opacity="0.028" stroke-width="1"/>
    </pattern>
    <filter id="soft" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="24"/>
    </filter>
    <filter id="glow" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="10"/>
    </filter>
  </defs>

  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#ground)"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#grid)"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#lamp)"/>

  <!-- Ghosted manufacturer wordmark, cropped by the frame like a workshop banner -->
  <text x="${WIDTH / 2}" y="${HEIGHT * 0.36}" text-anchor="middle"
        font-family="ui-sans-serif, system-ui, Segoe UI, Roboto, Arial, sans-serif"
        font-size="${Math.min(180, (WIDTH * 1.35) / Math.max(wordmark.length, 5))}" font-weight="800"
        letter-spacing="-5" fill="#ffffff" fill-opacity="0.05">${wordmark}</text>

  <!-- Workshop floor: a lit strip the bike stands on -->
  <ellipse cx="${WIDTH / 2}" cy="${groundY + 10}" rx="${WIDTH * 0.4}" ry="36"
           fill="${accent}" opacity="0.14" filter="url(#soft)"/>
  <line x1="0" y1="${groundY + 2}" x2="${WIDTH}" y2="${groundY + 2}"
        stroke="#ffffff" stroke-opacity="0.06" stroke-width="2"/>

  <g transform="translate(${bikeLeft} ${bikeTop}) scale(${scale}) rotate(${lean} ${VIEW.w / 2} ${g})">
    <!-- Contact shadows under each tyre -->
    <ellipse cx="${p.rearX}" cy="${g + 3}" rx="${p.rearR * 0.75}" ry="6" fill="#000" opacity="0.6"/>
    <ellipse cx="${p.frontX}" cy="${g + 3}" rx="${p.frontR * 0.75}" ry="6" fill="#000" opacity="0.6"/>

    ${p.panniers ? `<rect x="${p.rearX - 34}" y="${p.seatY + 6}" width="64" height="46" rx="7" fill="#242a32" stroke="#39404a" stroke-width="1.5"/>` : ''}

    ${exhaustPath(p)}

    <!-- Swingarm and rear shock -->
    <line x1="${p.rearX}" y1="${rearHubY}" x2="${p.engineRearX + 6}" y2="${p.engineBottomY - 20}"
          stroke="#3d444e" stroke-width="9" stroke-linecap="round"/>
    <line x1="${p.engineRearX + 24}" y1="${p.engineBottomY - 28}" x2="${p.seatRearX + 54}" y2="${p.spineY + 2}"
          stroke="#4c545f" stroke-width="5" stroke-linecap="round"/>

    <!-- Frame spine and downtube -->
    <line x1="${p.seatRearX + 10}" y1="${p.spineY + 2}" x2="${headX}" y2="${headY + 10}"
          stroke="#454d58" stroke-width="6" stroke-linecap="round"/>
    <line x1="${headX}" y1="${headY + 12}" x2="${p.engineFrontX - 6}" y2="${p.engineBottomY - 12}"
          stroke="#3d444e" stroke-width="5" stroke-linecap="round"/>

    <!-- Fork legs -->
    <line x1="${p.frontX}" y1="${frontHubY}" x2="${headX + 2}" y2="${headY - 6}"
          stroke="#5c646f" stroke-width="8" stroke-linecap="round"/>
    <line x1="${p.frontX - 5}" y1="${frontHubY}" x2="${headX - 3}" y2="${headY - 4}"
          stroke="#3f4650" stroke-width="6" stroke-linecap="round"/>

    ${wheel(p.rearX, rearHubY, p.rearR, accent)}
    ${wheel(p.frontX, frontHubY, p.frontR, accent)}

    ${engine(p, accent)}

    <!-- Bodywork: tail, seat, tank as one silhouette -->
    <path d="${bodyPath(p)}" fill="url(#bodyMetal)" stroke="#5a626e" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="${bodyPath(p)}" fill="none" stroke="${accent}" stroke-width="1.6" opacity="0.5"/>
    ${p.seatSteps ? seatSeam(p) : ''}

    ${fairingPart(p, headX, headY, accent)}

    <!-- Handlebar -->
    <line x1="${headX - 24}" y1="${p.barY}" x2="${headX + 14}" y2="${p.barY - 3}"
          stroke="#616a76" stroke-width="5" stroke-linecap="round"/>
    <line x1="${headX + 2}" y1="${p.barY}" x2="${headX + 1}" y2="${headY - 4}"
          stroke="#4c545f" stroke-width="4" stroke-linecap="round"/>

    <!-- Headlight -->
    <circle cx="${headX + 13}" cy="${headY - 12}" r="8.5" fill="${accent}" opacity="0.85"/>
    <circle cx="${headX + 13}" cy="${headY - 12}" r="14" fill="${accent}" opacity="0.22" filter="url(#glow)"/>
  </g>

  <!-- Bottom fade so overlaid card text always has contrast -->
  <rect y="${HEIGHT * 0.56}" width="${WIDTH}" height="${HEIGHT * 0.44}" fill="url(#fade)"/>

  <!-- Technical-drawing furniture -->
  <g stroke="${accent}" stroke-opacity="0.35" stroke-width="3" fill="none">
    <path d="M 44 96 L 44 44 L 96 44"/>
    <path d="M ${WIDTH - 96} 44 L ${WIDTH - 44} 44 L ${WIDTH - 44} 96"/>
  </g>
  <!-- Kept at 16% height: a cover-fitted card crops the top and bottom of this
       2:3 image, and the honesty label has to survive that crop. -->
  <text x="${WIDTH - 44}" y="${HEIGHT * 0.16}" text-anchor="end"
        font-family="ui-monospace, Consolas, monospace" font-size="20"
        fill="#ffffff" fill-opacity="0.28" letter-spacing="3">ILLUSTRATION — NOT A PHOTO</text>
</svg>`;
}

function escapeXml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

/**
 * URL stored in MotorcycleImage.url for a generated placeholder. Kept in one
 * place so the seed and the route agree on its shape.
 */
export function placeholderUrl(slug: string, category: MotorcycleCategory): string {
	return `/img/placeholder/${encodeURIComponent(slug)}.svg?c=${category}`;
}

export const PLACEHOLDER_ATTRIBUTION =
	'Generated illustration (MotoSwipe). Not a photograph of the actual motorcycle.';
