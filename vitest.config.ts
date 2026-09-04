import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Vitest runs plain Node with no Svelte or SvelteKit plugin.
 *
 * The suite exercises services, domain logic and the database — not components —
 * so the compiler and router are dead weight here. `$lib` is therefore aliased
 * by hand, since SvelteKit is not around to do it.
 */
export default defineConfig({
	resolve: {
		alias: {
			$lib: fileURLToPath(new URL('./src/lib', import.meta.url))
		}
	},
	test: {
		include: ['src/**/*.{test,spec}.ts', 'tests/**/*.{test,spec}.ts'],
		// Playwright owns tests/e2e; Vitest would try to run those specs and fail
		// on the `@playwright/test` imports.
		exclude: ['**/node_modules/**', 'tests/e2e/**'],
		environment: 'node',
		// Integration tests share one Postgres schema; running files in parallel
		// would have them truncating each other's tables mid-assertion.
		fileParallelism: false,
		setupFiles: ['./tests/setup.ts'],
		testTimeout: 20_000,
		hookTimeout: 30_000,
		coverage: {
			provider: 'v8',
			include: ['src/lib/**/*.ts'],
			exclude: ['src/lib/**/*.{test,spec}.ts', 'src/lib/server/db/generated/**']
		}
	}
});
