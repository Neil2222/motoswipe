import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/client';
import { env } from '../env';

/**
 * Prisma client singleton.
 *
 * Prisma 7 talks to Postgres through a driver adapter (node-postgres) rather
 * than a bundled Rust engine, which is why the Docker image needs no
 * architecture-specific engine binaries.
 *
 * The client is created lazily, on first use, for a specific reason: SvelteKit's
 * build imports every server module to analyse routes, and `vite build` must
 * work on a machine with no database credentials. Constructing the pool at
 * module load broke exactly that — the Docker build failed because DATABASE_URL
 * is (rightly) not available at image-build time.
 *
 * The instance is cached on `globalThis` in development so Vite's HMR does not
 * open a new connection pool on every server-module reload.
 */

const globalForPrisma = globalThis as unknown as {
	__motoswipePrisma?: PrismaClient;
};

let client: PrismaClient | undefined;

function createClient(): PrismaClient {
	const adapter = new PrismaPg({
		connectionString: env.databaseUrl,
		// A NAS Postgres is usually configured for 100 connections in total. Ten
		// per app instance leaves room for pgAdmin, backups and a second replica.
		max: 10,
		// Fail fast rather than hanging a request for 30s when the database is
		// unreachable.
		connectionTimeoutMillis: 10_000
	});

	return new PrismaClient({
		adapter,
		log: ['warn', 'error']
	});
}

function getClient(): PrismaClient {
	if (!client) {
		client = globalForPrisma.__motoswipePrisma ?? createClient();
		if (!env.isProduction) globalForPrisma.__motoswipePrisma = client;
	}
	return client;
}

/**
 * A transparent proxy over the real client. Every property access constructs
 * the client on demand, so importing this module is free.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
	get(_target, property) {
		const instance = getClient() as unknown as Record<string | symbol, unknown>;
		const value = instance[property];
		return typeof value === 'function' ? value.bind(instance) : value;
	}
});

export type { PrismaClient };
