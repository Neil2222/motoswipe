import 'dotenv/config';
import { chromium, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

/**
 * Drives the whole MVP flow end to end in a browser, including the comparison
 * phase, and screenshots each stage.
 *
 * Development tool, not a test — assertions live in tests/e2e.
 */
const OUT = process.argv[2] ?? 'shots';
const BASE = process.env.SHOT_BASE ?? 'http://127.0.0.1:5173';
const EMAIL = process.env.SEED_USER_EMAIL ?? 'test@example.local';
const PASSWORD = process.env.SEED_USER_PASSWORD ?? '';

mkdirSync(OUT, { recursive: true });

const shot = async (page: Page, name: string, fullPage = false) => {
	await page.waitForTimeout(700);
	await page.screenshot({ path: `${OUT}/${name}.png`, fullPage });
	console.log(`  shot ${name}`);
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
page.on('pageerror', (e) => console.log(`  [page error] ${e.message}`));
page.on('console', (m) => {
	if (m.type() === 'error') console.log(`  [console] ${m.text()}`);
});

console.log('sign in');
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await page.fill('#identifier', EMAIL);
await page.fill('#password', PASSWORD);
await Promise.all([
	page.waitForURL((u) => !u.pathname.includes('/login')),
	page.getByRole('button', { name: 'Sign in', exact: true }).click()
]);

console.log('create round');
await page.goto(`${BASE}/rounds/new`, { waitUntil: 'networkidle' });
await page.fill('#name', `Full flow ${Date.now().toString(36)}`);
await page.fill('#goal', 'Something I can commute on and still enjoy on a Sunday');
await Promise.all([
	page.waitForURL(/\/swipe$/),
	page.getByRole('button', { name: /Create round and start swiping/ }).click()
]);
const roundId = page.url().match(/rounds\/([^/]+)\//)?.[1] ?? '';
console.log(`  round ${roundId}`);

await page.waitForSelector('[aria-roledescription="Swipe deck"]');
const gotIt = page.getByRole('button', { name: 'Got it' });
if (await gotIt.isVisible().catch(() => false)) await gotIt.click();
await page.waitForTimeout(800);

console.log('swipe the whole deck');
// Like/superlike enough bikes to make the comparison phase meaningful.
const pattern = [
	'ArrowRight',
	'ArrowUp',
	'ArrowRight',
	'ArrowLeft',
	'ArrowRight',
	'ArrowUp',
	'ArrowLeft',
	'ArrowRight',
	'ArrowDown',
	'ArrowRight'
];
for (let i = 0; i < 38; i++) {
	const done = await page
		.locator('text=Deck complete')
		.first()
		.isVisible()
		.catch(() => false);
	if (done) break;
	await page.keyboard.press(pattern[i % pattern.length]);
	await page.waitForTimeout(430);
}
await shot(page, 'swipe-complete');

console.log('shortlist');
await page.goto(`${BASE}/rounds/${roundId}/likes`, { waitUntil: 'networkidle' });
await shot(page, 'likes', true);
await page.click('button:has-text("List")');
await shot(page, 'likes-list');

console.log('compare');
await page.goto(`${BASE}/rounds/${roundId}/compare`, { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
await shot(page, 'compare');

for (let i = 0; i < 14; i++) {
	const gone = await page
		.locator('text=Nothing left to compare')
		.isVisible()
		.catch(() => false);
	if (gone) break;
	await page.keyboard.press(i % 3 === 0 ? 'ArrowRight' : 'ArrowLeft');
	await page.waitForTimeout(750);
}
await shot(page, 'compare-after');

console.log('results');
await page.goto(`${BASE}/rounds/${roundId}/results`, { waitUntil: 'networkidle' });
await shot(page, 'results', true);

console.log('motorcycle detail');
const winnerLink = page.locator('a:has-text("See the full details")').first();
if (await winnerLink.isVisible().catch(() => false)) {
	await winnerLink.click();
	await page.waitForLoadState('networkidle');
	await shot(page, 'motorcycle', true);
}

console.log('round overview + dashboard');
await page.goto(`${BASE}/rounds/${roundId}`, { waitUntil: 'networkidle' });
await shot(page, 'round-overview', true);
await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
await shot(page, 'dashboard', true);

console.log('profile');
await page.goto(`${BASE}/profile`, { waitUntil: 'networkidle' });
await shot(page, 'profile', true);

console.log('mobile');
await page.setViewportSize({ width: 390, height: 844 });
for (const [path, name] of [
	[`/rounds/${roundId}/compare`, 'm-compare'],
	[`/rounds/${roundId}/results`, 'm-results'],
	['/dashboard', 'm-dashboard']
] as const) {
	await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
	await shot(page, name);
}

await browser.close();
console.log('\ndone');
