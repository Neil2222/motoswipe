/** A detail page can always return, including in a fresh tab or installed PWA. */
export function motorcycleReturnTo(value: string | null | undefined): string {
	const fallback = '/motorcycles';
	if (
		!value ||
		!value.startsWith('/') ||
		value.startsWith('//') ||
		value.includes('\\') ||
		[...value].some((character) => character.charCodeAt(0) <= 32)
	) {
		return fallback;
	}
	try {
		const url = new URL(value, 'https://motoswipe.invalid');
		// Only listing/deck pages are destinations, never external URLs, actions,
		// or another detail page that could create a chain of Back links.
		if (
			!/^\/(?:motorcycles|garage|admin\/motorcycles|rounds\/[a-zA-Z0-9-]+\/(?:swipe|likes|results|compare))$/.test(
				url.pathname
			)
		)
			return fallback;
		return url.pathname + url.search + url.hash;
	} catch {
		return fallback;
	}
}

export function motorcycleHref(id: string, returnTo: string): string {
	const query = new URLSearchParams({ returnTo: motorcycleReturnTo(returnTo) });
	return `/motorcycles/${encodeURIComponent(id)}?${query}`;
}
