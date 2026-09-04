/**
 * Telling two image URLs apart — or not.
 *
 * The same Wikimedia Commons file reaches the catalogue by several roads: the
 * English article's infobox, the German article's, a Commons search. Each
 * road hands back a different URL for the same bytes — a `thumb/…/1280px-`
 * rendering versus the original, and a `utm_source=` that names the wiki the
 * link was copied from. Keyed by URL, a gallery shows the same photograph
 * twice; keyed by the Commons file name, it does not.
 */

const COMMONS_FILE = /\/wikipedia\/commons\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/?#]+)/i;

/** The Commons file name a URL renders, decoded, or null for other hosts. */
export function commonsFileName(url: string): string | null {
	const match = COMMONS_FILE.exec(url);
	if (!match) return null;
	try {
		return decodeURIComponent(match[1]);
	} catch {
		return match[1];
	}
}

/**
 * A key under which two URLs of the same picture collide.
 *
 * Commons files key on their file name; anything else on the URL without its
 * query string, since tracking parameters never change the picture.
 */
export function imageIdentityKey(url: string): string {
	const file = commonsFileName(url);
	if (file) return `commons:${file.toLowerCase()}`;
	return url.split(/[?#]/)[0];
}
