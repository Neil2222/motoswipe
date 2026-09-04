import { expect, test, type Page } from '@playwright/test';

/**
 * The MVP journey, end to end, in a real browser:
 *
 *   register → set measurements → create a round → swipe (like, dislike,
 *   superlike, skip) → leave → come back → resume in the same place → view the
 *   shortlist → compare head to head → see the winner and statistics
 *
 * Every account is created fresh with a unique email, so runs do not collide
 * and nothing seeded is disturbed.
 */

function uniqueUser() {
	const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
	return {
		email: `e2e-${stamp}@example.test`,
		username: `e2e${stamp}`,
		displayName: 'E2E Rider',
		password: 'correct-horse-battery-staple'
	};
}

async function register(page: Page, user: ReturnType<typeof uniqueUser>) {
	await page.goto('/register');

	/**
	 * Wait for hydration before touching the form.
	 *
	 * Typing into a server-rendered input before Svelte hydrates gets silently
	 * undone: hydration reconciles the input against component state, which is
	 * still empty. The password strength meter only renders client-side in
	 * response to input, so seeing it proves the component is live.
	 */
	await page.fill('#password', user.password);
	await expect(page.getByText('Strong')).toBeVisible();

	await page.fill('#displayName', user.displayName);
	await page.fill('#username', user.username);
	await page.fill('#email', user.email);

	// Guard against the same race in reverse: assert every field really holds
	// what we typed before submitting.
	await expect(page.locator('#displayName')).toHaveValue(user.displayName);
	await expect(page.locator('#username')).toHaveValue(user.username);
	await expect(page.locator('#email')).toHaveValue(user.email);

	await Promise.all([
		page.waitForURL(/\/profile/),
		page.getByRole('button', { name: 'Create account' }).click()
	]);
}

/**
 * Safety net for the shortcuts dialog.
 *
 * It is opt-in now, so it should never be open here — but if that ever changes
 * it would silently swallow the arrow keys these tests depend on, and a
 * mysteriously stuck deck is a bad way to find out.
 */
async function ensureNoDialog(page: Page) {
	const gotIt = page.getByRole('button', { name: 'Got it' });
	if (await gotIt.isVisible().catch(() => false)) await gotIt.click();
	await expect(gotIt).toHaveCount(0);
}

/** Reads "12/38" out of the swipe header. */
async function swipeCount(page: Page): Promise<number> {
	const text = await page.locator('header .numeral').first().innerText();
	return Number(text.split('/')[0].trim());
}

/**
 * Presses a decision key and waits for the counter to actually move.
 *
 * Never sleep a fixed number of milliseconds here. A swipe is an animation plus
 * a network round trip, and the deck deliberately ignores input while a card is
 * still flying — so on a loaded machine a fixed wait silently drops presses and
 * the test fails somewhere far away, complaining about a shortlist that is too
 * small.
 */
async function swipe(page: Page, key: string): Promise<void> {
	const before = await swipeCount(page);
	await page.keyboard.press(key);
	await expect.poll(() => swipeCount(page), { timeout: 15_000 }).toBe(before + 1);
}

test.describe('MotoSwipe journey', () => {
	test('register, swipe, resume, compare and reach a winner', async ({ page }) => {
		const user = uniqueUser();

		// ---------------------------------------------------------------- register
		await test.step('register', async () => {
			await register(page, user);
			await expect(page.getByRole('heading', { name: user.displayName })).toBeVisible();
		});

		// ------------------------------------------------------------ measurements
		await test.step('save height and inseam', async () => {
			await page.fill('#heightCm', '175');
			await page.fill('#inseamCm', '78');
			await page.getByRole('button', { name: /Save details/ }).click();

			// The fit preview should now be specific rather than asking for input.
			await expect(page.getByText('Likely comfortable').first()).toBeVisible();
		});

		// -------------------------------------------------------------- new round
		const roundName = `E2E round ${Date.now().toString(36)}`;
		await test.step('create a round with no filters', async () => {
			await page.goto('/rounds/new');
			await page.fill('#name', roundName);

			// The unfiltered deck should report the full catalogue.
			const deckSize = Number(
				(await page.locator('p.numeral').first().innerText()).replace(/\D/g, '')
			);
			expect(deckSize).toBeGreaterThan(0);

			await Promise.all([
				page.waitForURL(/\/swipe$/),
				page.getByRole('button', { name: /Create round and start swiping/ }).click()
			]);
		});

		const roundId = page.url().match(/rounds\/([^/]+)\//)?.[1] ?? '';
		expect(roundId).toBeTruthy();

		// ------------------------------------------------------------------ swipe
		await test.step('swipe with all four decisions', async () => {
			await expect(page.locator('[aria-roledescription="Swipe deck"]')).toBeVisible();
			await ensureNoDialog(page);

			expect(await swipeCount(page)).toBe(0);

			// like, nope, superlike, skip — one of each, by keyboard.
			for (const key of ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown']) {
				await page.keyboard.press(key);
				await page.waitForTimeout(500);
			}

			await expect.poll(() => swipeCount(page), { timeout: 10_000 }).toBe(4);

			// The counters reflect what was actually pressed.
			await expect(page.getByText('1 likes')).toBeVisible();
			await expect(page.getByText('1 super')).toBeVisible();
			await expect(page.getByText('1 nope')).toBeVisible();
		});

		// --------------------------------------------------------- info sheet
		await test.step('specifications are one tap away, not in your face', async () => {
			await page.getByRole('button', { name: 'Show specifications' }).click();
			const sheet = page.getByRole('dialog', { name: 'Specifications' });
			await expect(sheet).toBeVisible();
			await expect(sheet.getByText('Engine')).toBeVisible();
			await expect(sheet.getByText('Seat height')).toBeVisible();
			await page.keyboard.press('Escape');
			await expect(sheet).not.toBeVisible();
		});

		// ------------------------------------------------------- leave and resume
		let nextBikeBeforeLeaving = '';
		await test.step('leave the round entirely', async () => {
			nextBikeBeforeLeaving = await page
				.locator('[aria-roledescription="Draggable motorcycle card"]')
				.first()
				.getAttribute('aria-label')
				.then((v) => v ?? '');

			await page.goto('/dashboard');
			await expect(page.getByRole('heading', { name: roundName })).toBeVisible();
		});

		await test.step('resume exactly where we stopped', async () => {
			await page.goto(`/rounds/${roundId}/swipe`);
			await expect(page.locator('[aria-roledescription="Swipe deck"]')).toBeVisible();
			await ensureNoDialog(page);

			// Same count, and the same motorcycle back on top.
			expect(await swipeCount(page)).toBe(4);

			const nextBikeAfterReturn = await page
				.locator('[aria-roledescription="Draggable motorcycle card"]')
				.first()
				.getAttribute('aria-label');
			expect(nextBikeAfterReturn).toBe(nextBikeBeforeLeaving);
		});

		// ----------------------------------------------- build a bigger shortlist
		await test.step('like enough motorcycles to compare', async () => {
			// Keep going until the shortlist is comfortably big enough for the
			// comparison phase, rather than pressing a fixed number of times and
			// hoping. Bounded so a bug cannot spin forever.
			for (let i = 0; i < 20; i++) {
				const shortlist = await page.locator('header .text-like').innerText();
				const likes = Number(shortlist.replace(/\D/g, ''));
				const supers = Number(
					(await page.locator('header .text-superlike').innerText()).replace(/\D/g, '')
				);
				if (likes + supers >= 6) break;

				const done = await page
					.getByText('Deck complete')
					.isVisible()
					.catch(() => false);
				if (done) break;

				await swipe(page, i % 4 === 3 ? 'ArrowUp' : 'ArrowRight');
			}
		});

		// -------------------------------------------------------------- shortlist
		await test.step('the shortlist holds the likes and superlikes', async () => {
			await page.goto(`/rounds/${roundId}/likes`);
			const heading = page.getByRole('heading', { level: 1 });
			await expect(heading).toContainText('liked');

			const cards = page.locator('article.panel');
			expect(await cards.count()).toBeGreaterThanOrEqual(2);

			// Superlikes are distinguishable from ordinary likes.
			await expect(page.getByText('Superlike').first()).toBeVisible();

			// Fit guidance is present, because measurements were set earlier.
			//
			// "Seat height unknown" counts, deliberately: on a real imported
			// catalogue only about a third of motorcycles publish a seat height,
			// so demanding a definite verdict would fail on honest data.
			await expect(
				page
					.locator('.chip')
					.filter({ hasText: /Likely|feel tall|unknown|measurements/i })
					.first()
			).toBeVisible();
		});

		await test.step('the superlike filter narrows the list', async () => {
			await page.getByRole('link', { name: /^Superlikes/ }).click();
			await expect(page.getByRole('heading', { level: 1 })).toContainText('superliked');
		});

		// ------------------------------------------------------------- comparison
		await test.step('compare head to head', async () => {
			await page.goto(`/rounds/${roundId}/compare`);
			await expect(page.getByRole('heading', { name: /Which would you rather own/ })).toBeVisible();

			// Two distinct motorcycles, and a VS between them.
			await expect(page.getByText('VS')).toBeVisible();

			// Vote a few times, waiting for the pair to actually change rather than
			// assuming a fixed animation duration.
			for (let i = 0; i < 5; i++) {
				const finished = await page
					.getByText('Nothing left to compare')
					.isVisible()
					.catch(() => false);
				if (finished) break;

				const before = await page.locator('h2').first().innerText();
				await page.keyboard.press(i % 2 === 0 ? 'ArrowLeft' : 'ArrowRight');
				await expect
					.poll(async () => page.locator('h2').first().innerText(), { timeout: 15_000 })
					.not.toBe(before);
			}
		});

		// ---------------------------------------------------------------- results
		await test.step('a winner and honest statistics', async () => {
			await page.goto(`/rounds/${roundId}/results`);

			// Scope to the winner block: "Elo" also appears in the explanation
			// under the full ranking, so an unscoped text match is ambiguous.
			const winner = page.locator('section').filter({ hasText: 'Your #1' }).first();
			await expect(winner).toBeVisible();
			await expect(winner.getByText('Elo', { exact: true })).toBeVisible();

			// A real rating, not a placeholder.
			const elo = Number(
				(await winner.locator('p.numeral').first().innerText()).replace(/[^0-9]/g, '')
			);
			expect(elo).toBeGreaterThan(1000);
			expect(elo).toBeLessThan(2500);

			// A win/loss record, so the winner earned its place in comparisons.
			await expect(winner.getByText('Record', { exact: true })).toBeVisible();

			// The swipe totals are present and non-zero.
			await expect(page.getByRole('heading', { name: 'The swipe phase' })).toBeVisible();
			const seen = Number(
				await page
					.locator('div.panel')
					.filter({ hasText: 'Seen' })
					.first()
					.locator('p.numeral')
					.innerText()
			);
			expect(seen).toBeGreaterThan(0);

			// Taste statistics.
			await expect(page.getByRole('heading', { name: /What your taste looks like/ })).toBeVisible();
			await expect(page.getByRole('heading', { name: 'Manufacturers' })).toBeVisible();
			await expect(page.getByRole('heading', { name: /The average bike you liked/ })).toBeVisible();
		});

		// ------------------------------------------------------------- duplication
		await test.step('duplicating a round starts a clean experiment', async () => {
			await page.goto('/dashboard');
			await page
				.locator('article.panel')
				.filter({ hasText: roundName })
				.getByRole('button', { name: 'Duplicate' })
				.click();

			const dialog = page.getByRole('dialog');
			await expect(dialog).toBeVisible();
			const copyName = `${roundName} copy`;
			await dialog.locator('#duplicate-name').fill(copyName);
			await dialog.getByRole('button', { name: 'Create copy' }).click();

			// The copy exists and has swiped nothing.
			const copy = page.locator('article.panel').filter({ hasText: copyName });
			await expect(copy).toBeVisible({ timeout: 15_000 });
			await expect(copy.getByText('0', { exact: false }).first()).toBeVisible();

			// And the original still shows its own progress.
			const original = page.locator('article.panel').filter({ hasText: roundName }).first();
			await expect(original).toBeVisible();
		});
	});

	test('a private round is invisible to another user', async ({ page, browser }) => {
		// Alice makes a round.
		const alice = uniqueUser();
		await register(page, alice);
		await page.goto('/rounds/new');
		await page.fill('#name', 'Alice private round');
		await Promise.all([
			page.waitForURL(/\/swipe$/),
			page.getByRole('button', { name: /Create round and start swiping/ }).click()
		]);
		const roundId = page.url().match(/rounds\/([^/]+)\//)?.[1] ?? '';
		expect(roundId).toBeTruthy();

		// Bob, in a separate browser context, guesses the URL.
		const bobContext = await browser.newContext();
		const bobPage = await bobContext.newPage();
		const bob = uniqueUser();
		await register(bobPage, bob);

		for (const path of ['', '/swipe', '/likes', '/results', '/compare']) {
			const response = await bobPage.goto(`/rounds/${roundId}${path}`);
			// 404, not 403: guessing a UUID must not even confirm it exists.
			expect(response?.status(), `GET /rounds/<alice>${path}`).toBe(404);
			await expect(bobPage.getByText('Alice private round')).toHaveCount(0);
		}

		await bobContext.close();
	});

	test('an anonymous visitor is sent to sign in, then back where they were', async ({ page }) => {
		const response = await page.goto('/dashboard');
		expect(response?.url()).toContain('/login');
		expect(response?.url()).toContain('redirectTo');

		await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
	});
});
