import { chromium } from '@playwright/test';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Renders every app icon from `static/brand/apex-heart.svg`.
 *
 *   npm run icons:generate
 *
 * The SVG is the source of truth; the PNGs exist because iOS home-screen
 * icons and Android maskable icons cannot be SVG. Rendered with the Chromium
 * that Playwright already installs for the e2e suite, so no image library is
 * added to the project.
 *
 * The maskable mark fits inside the central safe circle (radius 40% of the
 * canvas). Apple and maskable icons have an opaque, square background; the OS
 * applies its own corner mask. Legacy filenames are refreshed as well.
 */

const ROOT = resolve(import.meta.dirname, '..');
const mark = readFileSync(resolve(ROOT, 'static/brand/apex-heart.svg'), 'utf8')
	.replace(/<svg[^>]*>/, '')
	.replace('</svg>', '');
const outDir = resolve(ROOT, 'static/icons');
mkdirSync(outDir, { recursive: true });

const targets = [
	{ file: 'icon-192.png', size: 192, maskable: false, square: false },
	{ file: 'icon-512.png', size: 512, maskable: false, square: false },
	{ file: 'apple-touch-icon.png', size: 180, maskable: false, square: true },
	{ file: 'icon-maskable-512.png', size: 512, maskable: true, square: true }
];

function iconSvg(maskable = false, square = false): string {
	const scale = maskable ? 0.78 : 0.94;
	const offset = (512 * (1 - scale)) / 2;
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none">
	<rect width="512" height="512" rx="${square ? 0 : 112}" fill="#0b0d10"/>
	<g transform="translate(${offset} ${offset}) scale(${scale})">${mark}</g>
</svg>\n`;
}

for (const file of [
	'static/favicon.svg',
	'static/favicon-apex-heart.svg',
	'src/lib/assets/favicon.svg'
]) {
	writeFileSync(resolve(ROOT, file), iconSvg());
}

function page(size: number, maskable: boolean, square: boolean): string {
	return `<!doctype html><html><head><style>
		html,body{margin:0;padding:0;background:transparent;}
		#c,#c svg{display:block;width:${size}px;height:${size}px;}
	</style></head><body><div id="c">${iconSvg(maskable, square)}</div></body></html>`;
}

const browser = await chromium.launch();
try {
	for (const target of targets) {
		const tab = await browser.newPage({
			viewport: { width: target.size, height: target.size },
			deviceScaleFactor: 1
		});
		await tab.setContent(page(target.size, target.maskable, target.square));
		const png = await tab.locator('#c').screenshot({ omitBackground: true });
		writeFileSync(resolve(outDir, target.file), png);
		copyFileSync(
			resolve(outDir, target.file),
			resolve(outDir, target.file.replace('.png', '-apex-heart.png'))
		);
		console.log(`wrote static/icons/${target.file} (${target.size}px)`);
		await tab.close();
	}
} finally {
	await browser.close();
}
