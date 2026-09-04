import type { MotorcycleProvider } from './types';
import { sampleProvider } from './providers/sample.provider';
import { wikipediaProvider } from './providers/wikipedia/wikipedia.provider';
import { rdwProvider } from './providers/rdw/rdw.provider';
import { wikipediaDeProvider } from './providers/wikipedia-de/wikipedia-de.provider';
import { manufacturerProvider } from './providers/manufacturer/manufacturer.provider';

/**
 * Provider registry.
 *
 * Adding a source is one line here plus one file under `providers/`. Nothing
 * else in the application knows a provider exists.
 */
const providers = new Map<string, MotorcycleProvider>();

function register(provider: MotorcycleProvider): void {
	if (providers.has(provider.source)) {
		throw new Error(`Duplicate provider source "${provider.source}"`);
	}
	providers.set(provider.source, provider);
}

register(sampleProvider);
register(wikipediaProvider);
register(rdwProvider);
register(wikipediaDeProvider);
register(manufacturerProvider);
// ... see README.md for how to add another

export function getProvider(source: string): MotorcycleProvider | undefined {
	return providers.get(source);
}

export function listProviders(): MotorcycleProvider[] {
	return [...providers.values()];
}
