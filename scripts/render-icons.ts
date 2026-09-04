import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Renders the PWA icons from `static/favicon.svg`.
 *
 *   npx tsx scripts/render-icons.ts
 *
 * The SVG is the source of truth; the PNGs exist because iOS home-screen
 * icons and Android maskable icons cannot be SVG. Rendered with the Chromium
 * that Playwright already installs for the e2e suite, so no image library is
 * added to the project for four files.
 *
 * The maskable variant adds padding: Android crops maskable icons to a circle
 * or squircle covering the middle 80%, so the mark is scaled into that safe
 * zone over the same dark ground.
 */

const ROOT = resolve(import.meta.dirname, '..');
const svg = readFileSync(resolve(ROOT, 'static/favicon.svg'), 'utf8');
const outDir = resolve(ROOT, 'static/icons');
mkdirSync(outDir, { recursive: true });

const targets: { file: string; size: number; maskable: boolean }[] = [
	{ file: 'icon-192.png', size: 192, maskable: false },
	{ file: 'icon-512.png', size: 512, maskable: false },
	{ file: 'apple-touch-icon.png', size: 180, maskable: false },
	{ file: 'icon-maskable-512.png', size: 512, maskable: true }
];

function page(size: number, maskable: boolean): string {
	// Maskable: the whole canvas is ground colour, the mark sits in the 80% safe zone.
	const inner = maskable ? Math.round(size * 0.8) : size;
	const offset = Math.round((size - inner) / 2);
	return `<!doctype html><html><head><style>
		html,body{margin:0;padding:0;background:${maskable ? '#0b0d10' : 'transparent'};}
		#c{width:${size}px;height:${size}px;position:relative;overflow:hidden;background:${maskable ? '#0b0d10' : 'transparent'};}
		#c svg{position:absolute;left:${offset}px;top:${offset}px;width:${inner}px;height:${inner}px;}
	</style></head><body><div id="c">${svg}</div></body></html>`;
}

const browser = await chromium.launch();
try {
	for (const target of targets) {
		const tab = await browser.newPage({
			viewport: { width: target.size, height: target.size },
			deviceScaleFactor: 1
		});
		await tab.setContent(page(target.size, target.maskable));
		const png = await tab.locator('#c').screenshot({ omitBackground: !target.maskable });
		writeFileSync(resolve(outDir, target.file), png);
		console.log(`wrote static/icons/${target.file} (${target.size}px)`);
		await tab.close();
	}
} finally {
	await browser.close();
}
