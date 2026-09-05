import { expect, test, type Page } from '@playwright/test';

async function startDemo(page: Page) {
	await page.goto('/demo');
	await page.getByRole('button', { name: 'Start the demo', exact: true }).click();
	await page.waitForURL(/\/swipe$/);
	await expect(page.locator('[aria-roledescription="Swipe deck"]')).toBeVisible();
	return new URL(page.url()).pathname;
}

async function count(page: Page) {
	return Number((await page.locator('header .numeral').first().innerText()).split('/')[0]);
}

test.afterEach(async ({ page }) => {
	// Discard only this browser context's own guest, if the test created one.
	await page.request.post('/demo?/discard', { form: {} });
});

test('full details stay in the same tab and return to the current bike after reload', async ({
	page,
	context
}) => {
	const swipePath = await startDemo(page);
	await page.getByRole('button', { name: 'Like', exact: true }).click();
	await expect.poll(() => count(page)).toBe(1);
	await expect(page.getByRole('button', { name: 'Undo last swipe' })).toBeEnabled();
	const current = await page
		.locator('[aria-roledescription="Draggable motorcycle card"]')
		.first()
		.getAttribute('aria-label');

	await page.getByRole('button', { name: 'Show specifications' }).click();
	await page.getByRole('link', { name: 'Full details' }).click();
	await page.waitForURL(/\/motorcycles\/[^/]+\?returnTo=/);
	expect(context.pages()).toHaveLength(1);
	await page.reload();
	const returnTo = new URL(page.url()).searchParams.get('returnTo')!;
	expect(returnTo).toMatch(new RegExp(swipePath + '\\?resume='));
	await expect(page.getByRole('link', { name: '← Back', exact: true })).toHaveAttribute(
		'href',
		returnTo
	);
	await page.getByRole('link', { name: '← Back', exact: true }).click();
	await page.waitForURL((url) => url.pathname === swipePath);
	await expect(
		page.locator('[aria-roledescription="Draggable motorcycle card"]').first()
	).toHaveAttribute('aria-label', current!);
	expect(await count(page)).toBe(1);
	await expect(page.getByRole('dialog', { name: 'Specifications' })).toHaveCount(0);

	await page.getByRole('button', { name: 'Show specifications' }).click();
	await page.getByRole('button', { name: 'Back to swiping', exact: true }).click();
	await expect(page.getByRole('dialog', { name: 'Specifications' })).toHaveCount(0);
	await page.getByRole('link', { name: 'Back to round' }).click();
	await expect(page).toHaveURL(new RegExp(swipePath.replace('/swipe', '') + '$'));
});

test('a fresh detail tab can return without browser history, with a safe catalogue fallback', async ({
	page,
	context
}) => {
	const swipePath = await startDemo(page);
	await page.getByRole('button', { name: 'Show specifications' }).click();
	const href = await page.getByRole('link', { name: 'Full details' }).getAttribute('href');
	const fresh = await context.newPage();
	await fresh.goto(href!);
	await fresh.getByRole('link', { name: '← Back', exact: true }).click();
	await fresh.waitForURL((url) => url.pathname === swipePath);
	await expect(fresh.locator('[aria-roledescription="Swipe deck"]')).toBeVisible();
	await fresh.close();

	const direct = await context.newPage();
	const detailPath = href!.split('?')[0];
	await direct.goto(detailPath);
	await expect(direct.getByRole('link', { name: '← Back', exact: true })).toHaveAttribute(
		'href',
		'/motorcycles'
	);
	await direct.getByRole('link', { name: '← Back', exact: true }).click();
	await expect(direct).toHaveURL(/\/motorcycles$/);
	await direct.goto(detailPath + '?returnTo=https%3A%2F%2Fexample.com');
	await expect(direct.getByRole('link', { name: '← Back', exact: true })).toHaveAttribute(
		'href',
		'/motorcycles'
	);
	await direct.close();
});

test('returning to browse preserves the search and works after refreshing details', async ({
	page
}) => {
	await page.goto('/motorcycles?q=Honda&page=1');
	const source = new URL(page.url());
	await page.locator('main a[href^="/motorcycles/"]').first().click();
	await page.waitForURL(/\/motorcycles\/[^/]+\?returnTo=/);
	await page.reload();
	await expect(page.getByRole('link', { name: '← Back', exact: true })).toHaveAttribute(
		'href',
		source.pathname + source.search
	);
	await page.getByRole('link', { name: '← Back', exact: true }).click();
	await expect(page).toHaveURL(source.href);
});
