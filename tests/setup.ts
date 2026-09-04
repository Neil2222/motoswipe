import 'dotenv/config';
import { config as loadDotenv } from 'dotenv';

/**
 * Test bootstrap.
 *
 * `.env.test` points at a separate database (`motoswipe_test`) so a test run
 * can truncate tables without destroying a development catalogue. It is loaded
 * with override:true precisely because a developer's `.env` will already have
 * set DATABASE_URL to the dev database.
 */
loadDotenv({ path: '.env.test', override: true, quiet: true });

if (!process.env.DATABASE_URL?.includes('test')) {
	throw new Error(
		`Refusing to run tests against "${process.env.DATABASE_URL}".\n` +
			'The integration tests truncate every table. Point DATABASE_URL in .env.test at a ' +
			'dedicated test database whose name contains "test".'
	);
}
