import { json } from '@sveltejs/kit';
import { isUuid, requireUserApi } from '$lib/server/guards';
import { setFavorite, toggleFavorite } from '$lib/server/services/favorite.service';
import type { RequestHandler } from './$types';

/**
 * Saving a motorcycle to the garage.
 *
 * An endpoint rather than a form action, because the heart appears in a grid
 * tile, on a detail page and in the garage itself, and none of those pages
 * should have to own an action for it.
 *
 * `favorited` says what the client wants the end state to be, so a double tap
 * or a retry lands where the user expects instead of flipping twice. Omit it
 * and the server toggles, which is what a no-JavaScript caller would want.
 */
export const POST: RequestHandler = async (event) => {
	const user = requireUserApi(event);

	const body = (await event.request.json().catch(() => null)) as {
		motorcycleId?: unknown;
		favorited?: unknown;
	} | null;

	const motorcycleId = typeof body?.motorcycleId === 'string' ? body.motorcycleId : '';
	if (!isUuid(motorcycleId)) {
		return json({ error: 'A motorcycle id is required.' }, { status: 400 });
	}

	const result =
		typeof body?.favorited === 'boolean'
			? await setFavorite(user.id, motorcycleId, body.favorited)
			: await toggleFavorite(user.id, motorcycleId);

	return json(result);
};
