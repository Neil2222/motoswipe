/**
 * URL-safe slugs.
 *
 * NFD normalisation first so accented model names ("Café Racer", "Süper") lose
 * their diacritics rather than being stripped to nothing.
 */
export function slugify(input: string): string {
	return input
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '') // combining marks left behind by NFD
		.toLowerCase()
		.replace(/[‘’']/g, '') // apostrophes join words: "n't" -> "nt"
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 120)
		.replace(/-+$/g, '');
}
