import { error } from '@sveltejs/kit';
import { isUuid } from '$lib/server/guards';
import { getMotorcycleDetail } from '$lib/server/services/motorcycle.service';
import { decisionsForMotorcycle } from '$lib/server/services/swipe.service';
import { isFavorite } from '$lib/server/services/favorite.service';
import { prisma } from '$lib/server/db/client';
import { assessFit } from '$lib/server/fit/fit';
import { FIT_DISCLAIMER } from '$lib/domain/fit';
import { NotFoundError } from '$lib/server/errors';
import { motorcycleReturnTo } from '$lib/utils/motorcycle-navigation';
import type { PageServerLoad } from './$types';

/**
 * Motorcycle detail.
 *
 * The catalogue is not private — any signed-in or anonymous visitor may read a
 * motorcycle page. What *is* private is "your decisions": that section is only
 * populated from the current user's own rounds.
 */
export const load: PageServerLoad = async (event) => {
	if (!isUuid(event.params.id)) error(404, { message: 'Motorcycle not found' });

	let bike;
	try {
		bike = await getMotorcycleDetail(event.params.id);
	} catch (err) {
		if (err instanceof NotFoundError) error(404, { message: 'Motorcycle not found' });
		throw err;
	}

	const user = event.locals.user;

	const [decisions, profile, favorited] = await Promise.all([
		user ? decisionsForMotorcycle(user.id, bike.id) : Promise.resolve([]),
		user
			? prisma.userProfile.findUnique({
					where: { userId: user.id },
					select: { heightCm: true, inseamCm: true }
				})
			: Promise.resolve(null),
		user ? isFavorite(user.id, bike.id) : Promise.resolve(false)
	]);

	const fit = assessFit(
		{ heightCm: profile?.heightCm ?? null, inseamCm: profile?.inseamCm ?? null },
		{
			seatHeightMm: bike.seatHeightMm,
			seatWidthMm: bike.seatWidthMm,
			wetWeightKg: bike.wetWeightKg
		}
	);

	return {
		returnTo: motorcycleReturnTo(event.url.searchParams.get('returnTo')),
		bike,
		decisions,
		favorited,
		/** Anonymous visitors may read a page but have nowhere to save it to. */
		canSave: Boolean(user),
		fit,
		fitDisclaimer: FIT_DISCLAIMER,
		hasMeasurements: Boolean(profile?.heightCm || profile?.inseamCm)
	};
};
