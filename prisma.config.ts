import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/**
 * Prisma 7 moved the connection URL out of schema.prisma. This file is used by
 * the CLI only (migrate / studio / db push). At runtime the application builds
 * its own connection through the pg driver adapter — see
 * `src/lib/server/db/client.ts`.
 *
 * DATABASE_URL is read from the environment, never committed. `dotenv/config`
 * loads a local `.env` for development; in Docker the variable is injected by
 * compose, so no .env file is required there.
 */
export default defineConfig({
	schema: 'prisma/schema.prisma',
	datasource: {
		url: process.env.DATABASE_URL
	},
	migrations: {
		seed: 'tsx prisma/seed.ts'
	}
});
