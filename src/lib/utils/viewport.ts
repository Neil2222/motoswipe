/**
 * Sizes an element to the viewport that is actually visible.
 *
 * `100dvh` is right in a browser tab. Installed to a home screen, Chrome on
 * Android lays the page out edge to edge and reports a `dvh` that includes
 * the system bars, so a full-height swipe deck ends with its action buttons
 * under the navigation bar. `window.innerHeight` (and the visual viewport,
 * where the browser exposes it) is what the person can see; the smaller of
 * the two wins, and the element follows it on every resize and rotation.
 *
 * A Svelte action: `<div use:fitToViewport>`. Leaves the element alone when
 * measuring is not possible, so the CSS fallback still applies.
 */
export function fitToViewport(node: HTMLElement): { destroy(): void } {
	if (typeof window === 'undefined') return { destroy() {} };

	const apply = () => {
		const visual = window.visualViewport?.height ?? Infinity;
		const height = Math.min(window.innerHeight, visual);
		if (Number.isFinite(height) && height > 0) node.style.height = `${Math.round(height)}px`;
	};

	apply();
	window.addEventListener('resize', apply);
	window.addEventListener('orientationchange', apply);
	window.visualViewport?.addEventListener('resize', apply);

	return {
		destroy() {
			window.removeEventListener('resize', apply);
			window.removeEventListener('orientationchange', apply);
			window.visualViewport?.removeEventListener('resize', apply);
		}
	};
}
