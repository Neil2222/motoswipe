import { getAdminStatistics } from '$lib/server/statistics/statistics.service';
import { listProviders } from '$lib/server/importers/registry';
import { env } from '$lib/server/env';
import type { PageServerLoad } from './$types';

/**
 * Operational overview.
 *
 * Deliberately read-only. The brief was basic visibility, not a CMS — and every
 * write surface here would be one more thing to secure on a box exposed to the
 * internet.
 */
export const load: PageServerLoad = async () => {
	const stats = await getAdminStatistics();

	return {
		stats,
		providers: listProviders().map((p) => ({
			source: p.source,
			displayName: p.displayName,
			requiresNetwork: p.requiresNetwork
		})),
		config: {
			nodeEnv: env.nodeEnv,
			allowRegistration: env.allowRegistration,
			sessionTtlDays: env.sessionTtlDays,
			trustProxyHops: env.trustProxyHops,
			originConfigured: Boolean(env.origin)
		}
	};
};
