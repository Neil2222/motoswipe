import { json } from '@sveltejs/kit';
import { prisma } from '$lib/server/db/client';
import type { RequestHandler } from './$types';

/**
 * Container healthcheck.
 *
 * Deliberately touches the database. A process that is listening but cannot
 * reach Postgres is not healthy, and reporting it as healthy is how a broken
 * container stays in a load balancer.
 *
 * The response carries no version, no configuration and no error detail — it is
 * reachable without authentication, so it must not become a reconnaissance
 * endpoint. Failures are logged server-side instead.
 */
export const GET: RequestHandler = async ({ setHeaders }) => {
	setHeaders({ 'Cache-Control': 'no-store' });

	try {
		await prisma.$queryRaw`SELECT 1`;
		return json({ status: 'ok' });
	} catch (error) {
		console.error('[motoswipe] healthcheck failed:', error);
		return json({ status: 'unhealthy' }, { status: 503 });
	}
};
