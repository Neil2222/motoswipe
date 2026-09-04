import { readBrowseQuery } from '$lib/domain/browse';
import { favoriteIdsAmong } from '$lib/server/services/favorite.service';
import {
	listManufacturersWithCounts,
	searchMotorcycles
} from '$lib/server/services/motorcycle.service';
import type { PageServerLoad } from './$types';

/**
 * The catalogue browser.
 *
 * Rounds are for deciding; this is for looking something up. The whole query
 * lives in the URL so a search can be shared, bookmarked and gone back to,
 * which is the least a page called "browse" owes you.
 */
export const load: PageServerLoad = async (event) => {
	// Readable without an account, like a motorcycle's own page. Hearts need
	// somewhere to be saved, so they simply do not appear for a visitor.
	const user = event.locals.user;
	const query = readBrowseQuery(event.url.searchParams);

	const [result, manufacturers] = await Promise.all([
		searchMotorcycles(query),
		listManufacturersWithCounts()
	]);

	// One query for the whole page of hearts rather than one per tile.
	const favorited = user
		? await favoriteIdsAmong(
				user.id,
				result.rows.map((row) => row.id)
			)
		: new Set<string>();

	return {
		query,
		manufacturers,
		total: result.total,
		page: result.page,
		pageCount: result.pageCount,
		canSave: Boolean(user),
		bikes: result.rows.map((bike) => ({ ...bike, favorited: favorited.has(bike.id) }))
	};
};
