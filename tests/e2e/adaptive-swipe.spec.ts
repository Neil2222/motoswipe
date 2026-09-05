import { expect, test, type Page } from '@playwright/test';

async function start(page: Page) {
	await page.goto('/demo');
	await page.getByRole('button', { name: 'Start the demo', exact: true }).click();
	await page.waitForURL(/\/swipe$/);
	await expect(page.locator('[aria-roledescription="Swipe deck"]')).toBeVisible();
	return page.url().match(/rounds\/([^/]+)/)![1];
}

async function count(page: Page) {
	return Number((await page.locator('header .numeral').first().innerText()).split('/')[0]);
}

async function swipe(page: Page, key = 'ArrowRight') {
	const previous = await count(page);
	await page.keyboard.press(key);
	await expect.poll(() => count(page)).toBe(previous + 1);
}

test.afterEach(async ({ page }) => {
	// Only the guest created by this test, identified by its isolated cookies.
	await page.request.post('/demo?/discard', { form: {} });
});

test('a failed refill can be retried without losing swipes or claiming completion', async ({
	page
}) => {
	const round = await start(page);
	await page.route(`**/api/rounds/${round}/deck?*`, (route) =>
		route.fulfill({ status: 503, body: '{}' })
	);
	for (let i = 0; i < 4; i++) await swipe(page, i === 0 ? 'ArrowLeft' : 'ArrowRight');
	await expect(page.getByRole('heading', { name: "Let's get the next bikes" })).toBeVisible();
	await expect(page.getByText('Deck complete', { exact: true })).toHaveCount(0);
	expect(await count(page)).toBe(4);
	await page.unroute(`**/api/rounds/${round}/deck?*`);
	await page.getByRole('button', { name: 'Try again', exact: true }).first().click();
	await expect(page.locator('[aria-roledescription="Swipe deck"]')).toBeVisible();
	expect(await count(page)).toBe(4);
	await expect(page.getByRole('link', { name: 'Shortlist 3', exact: true })).toBeVisible();
});

test('rapid choices save in order and undo waits for pending saves', async ({ page }) => {
	const round = await start(page);
	let concurrent = 0;
	let maximumConcurrent = 0;
	await page.route(`**/api/rounds/${round}/swipes`, async (route) => {
		if (route.request().method() !== 'POST') return route.continue();
		concurrent++;
		maximumConcurrent = Math.max(maximumConcurrent, concurrent);
		// Deliberate network latency: multiple gestures should queue, not race.
		await new Promise((resolve) => setTimeout(resolve, 900));
		const response = await route.fetch();
		concurrent--;
		await route.fulfill({ response });
	});
	for (const key of ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown']) await swipe(page, key);
	await expect(page.getByRole('button', { name: 'Undo last swipe', exact: true })).toBeDisabled();
	await expect(page.getByText('Deck complete', { exact: true })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Undo last swipe', exact: true })).toBeEnabled();
	expect(maximumConcurrent).toBe(1);
	const stored = await (await page.request.get(`/api/rounds/${round}/progress`)).json();
	expect(stored).toMatchObject({ swiped: 4, likes: 1, dislikes: 1, superlikes: 1, skips: 1 });
	await page.getByRole('button', { name: 'Undo last swipe', exact: true }).click();
	await expect.poll(() => count(page)).toBe(3);
	const afterUndo = await (await page.request.get(`/api/rounds/${round}/progress`)).json();
	expect(afterUndo).toMatchObject({ swiped: 3, skips: 0 });
	await swipe(page);
	await page.getByRole('link', { name: 'Shortlist 3', exact: true }).click();
	await page.waitForURL(/\/likes$/);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('3 liked');
	const afterLeaving = await (await page.request.get(`/api/rounds/${round}/progress`)).json();
	expect(afterLeaving).toMatchObject({ swiped: 4, shortlist: 3 });
	await page.goto(`/rounds/${round}/swipe`);
	await page.reload();
	await expect(page.locator('[aria-roledescription="Swipe deck"]')).toBeVisible();
	expect(await count(page)).toBe(4);
});

test('small screens keep controls visible and a rejected save restores the card', async ({
	page
}) => {
	await page.setViewportSize({ width: 320, height: 568 });
	const round = await start(page);
	for (const name of ['Dislike', 'Like', 'Superlike', 'Skip']) {
		const button = page.getByRole('button', { name, exact: true });
		await expect(button).toBeInViewport();
		const box = await button.boundingBox();
		expect(box!.width).toBeGreaterThanOrEqual(44);
		expect(box!.height).toBeGreaterThanOrEqual(44);
	}
	const top = page.locator('[aria-roledescription="Draggable motorcycle card"]').first();
	const before = await top.getAttribute('aria-label');
	await page.route(`**/api/rounds/${round}/swipes`, (route) =>
		route.fulfill({
			status: 503,
			contentType: 'application/json',
			body: JSON.stringify({ message: 'Test: save unavailable' })
		})
	);
	await page.getByRole('button', { name: 'Like', exact: true }).click();
	await expect(page.getByText('Test: save unavailable', { exact: true })).toBeVisible();
	expect(await count(page)).toBe(0);
	await expect(top).toHaveAttribute('aria-label', before!);
	await page.unroute(`**/api/rounds/${round}/swipes`);
	await swipe(page);
	await expect(page.getByRole('button', { name: 'Undo last swipe', exact: true })).toBeEnabled();
	await page.getByRole('button', { name: 'Undo last swipe', exact: true }).click();
	await expect.poll(() => count(page)).toBe(0);
	await expect(top).toHaveAttribute('aria-label', before!);
});
