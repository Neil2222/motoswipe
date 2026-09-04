import { defineConfig, devices } from '@playwright/test';
import 'dotenv/config';

/**
 * End-to-end tests.
 *
 * These run against the development server and the development database. They
 * create their own accounts and rounds rather than relying on seeded state, so
 * a run neither depends on nor destroys whatever is already there.
 *
 * Run with:  npm run test:e2e
 * Watch it:  npm run test:e2e -- --headed
 */
const PORT = Number(process.env.E2E_PORT ?? 5173);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
	testDir: './tests/e2e',
	// The swipe flow is inherently sequential and shares one database.
	fullyParallel: false,
	workers: 1,
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
	timeout: 90_000,
	expect: { timeout: 10_000 },

	use: {
		baseURL: BASE_URL,
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
		video: 'off'
	},

	projects: [
		{ name: 'chromium', use: { ...devices['Desktop Chrome'] } },
		// The swipe deck is a touch interface first; this exercises the pointer
		// path a phone actually takes.
		{ name: 'mobile', use: { ...devices['Pixel 7'] } }
	],

	webServer: {
		command: `npm run dev -- --port ${PORT} --host 127.0.0.1`,
		url: `${BASE_URL}/healthz`,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
		stdout: 'ignore',
		stderr: 'pipe'
	}
});
