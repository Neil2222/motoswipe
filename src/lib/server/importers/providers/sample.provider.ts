import type {
	ListOptions,
	MotorcycleProvider,
	NormalizedMotorcycle,
	ProviderListing,
	RawMotorcycle
} from '../types';
import { SAMPLE_MOTORCYCLES } from './sample-data';
import { placeholderUrl, PLACEHOLDER_ATTRIBUTION } from '../../images/placeholder';

/**
 * The reference provider.
 *
 * It reads from a local array instead of the network, which makes it the
 * working example to copy when writing a real one: the same four methods, the
 * same normalisation duties, no database access anywhere.
 *
 * It also happens to be how `npm run db:seed` populates a development
 * catalogue, so the import path is exercised on every fresh install rather than
 * being code nobody runs until the first real provider arrives.
 */
export class SampleProvider implements MotorcycleProvider {
	readonly source = 'sample';
	readonly displayName = 'Built-in sample catalogue (demo data)';
	readonly requiresNetwork = false;

	async listMotorcycles(options: ListOptions = {}): Promise<ProviderListing[]> {
		const all = SAMPLE_MOTORCYCLES.map((m) => ({
			externalId: m.externalId,
			label: [m.manufacturerName, m.model, m.variant].filter(Boolean).join(' '),
			sourceUrl: m.sourceUrl ?? null
		}));

		return options.limit ? all.slice(0, options.limit) : all;
	}

	async fetchMotorcycle(externalId: string): Promise<RawMotorcycle> {
		const found = SAMPLE_MOTORCYCLES.find((m) => m.externalId === externalId);
		if (!found) throw new Error(`No sample motorcycle with id "${externalId}"`);
		return found;
	}

	/**
	 * The sample data is already in MotoSwipe's shape, so normalisation here only
	 * attaches placeholder artwork. A real provider does the actual work in this
	 * method: unit conversion, category mapping, parsing "999cc" into a number.
	 */
	normalizeMotorcycle(raw: RawMotorcycle): NormalizedMotorcycle | null {
		const m = raw as NormalizedMotorcycle;
		if (!m?.model || !m.manufacturerName) return null;

		const slugSeed = [m.manufacturerName, m.model, m.variant, m.modelYear]
			.filter(Boolean)
			.join('-')
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-');

		return {
			...m,
			images: [
				{
					url: placeholderUrl(slugSeed, m.category),
					isPrimary: true,
					sortOrder: 0,
					width: 1000,
					height: 1500,
					imageType: 'PLACEHOLDER',
					attribution: PLACEHOLDER_ATTRIBUTION
				}
			]
		};
	}
}

export const sampleProvider = new SampleProvider();
