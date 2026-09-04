import 'dotenv/config';
import { chromium, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

/**
 * Development screenshot helper.
 *
 * Not part of the test suite — it exists so a change to the visual design can
 * actually be looked at:
 *
 *   npx tsx scripts/shot.ts <out-dir> <path...>
 *
 * Prefix a path with `m:` for a phone viewport, `f:` for a full-page capture.
 */
const [outDir = 'shots', ...paths] = process.argv.slice(2);
const BASE = process.env.SHOT_BASE ?? 'http://127.0.0.1:5173';

const EMAIL = process.env.SEED_USER_EMAIL ?? 'test@example.local';
const PASSWORD = process.env.SEED_USER_PASSWORD ?? '';

mkdirSync(outDir, { recursive: true });

async function signIn(page: Page) {
	if (!PASSWORD) return;
	await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
	if (!page.url().includes('/login')) return; // already signed in
	await page.fill('#identifier', EMAIL);
	await page.fill('#password', PASSWORD);
	await Promise.all([
		page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15_000 }),
		page.click('button[type=submit]')
	]);
}

const browser = await chromium.launch();
const context = await browser.newContext({
	viewport: { width: 1440, height: 900 },
	deviceScaleFactor: 1
});
const page = await context.newPage();

await signIn(page);

for (const spec of paths) {
	const mobile = spec.startsWith('m:');
	const fullPage = spec.startsWith('f:');
	const path = spec.replace(/^[mf]:/, '');

	await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });
	await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
	// Give transitions and image decoding a beat to settle.
	await page.waitForTimeout(900);

	const name = (mobile ? 'm-' : '') + (path.replace(/[^a-z0-9]+/gi, '-') || 'home') + '.png';
	await page.screenshot({ path: `${outDir}/${name}`, fullPage });
	console.log(`${outDir}/${name}`);
}

await browser.close();
