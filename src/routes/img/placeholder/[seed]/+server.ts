import { error } from '@sveltejs/kit';
import { renderPlaceholderSvg } from '$lib/server/images/placeholder';
import { MotorcycleCategory } from '$lib/domain/enums';
import type { RequestHandler } from './$types';

/**
 * Serves a generated placeholder illustration.
 *
 * Output depends only on the URL, so it is immutable and can be cached hard by
 * the browser and by any reverse proxy in front. That matters: the swipe deck
 * preloads several of these at a time.
 */
export const GET: RequestHandler = ({ params, url, setHeaders }) => {
	const seed = params.seed.replace(/\.svg$/i, '');
	if (!seed || seed.length > 160) error(404, { message: 'Not found' });

	const requested = url.searchParams.get('c') ?? 'OTHER';
	const category = (requested in MotorcycleCategory ? requested : 'OTHER') as MotorcycleCategory;

	// Derived from the seed rather than passed in: a caller must not be able to
	// stuff arbitrary text into a document we serve from our own origin.
	const words = seed.split('-').filter(Boolean);
	const manufacturer = words[0] ?? 'Motorcycle';
	const model = words.slice(1, 4).join(' ') || 'Model';

	const svg = renderPlaceholderSvg({
		seed,
		category,
		manufacturer,
		model
	});

	setHeaders({
		'Content-Type': 'image/svg+xml; charset=utf-8',
		'Cache-Control': 'public, max-age=31536000, immutable',
		// The SVG contains no scripts or external references, but a CSP costs
		// nothing and keeps it inert if that ever changes.
		'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'"
	});

	return new Response(svg);
};
