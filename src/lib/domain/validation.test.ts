import { describe, expect, it } from 'vitest';
import { defaultRoundName } from './validation';

describe('defaultRoundName', () => {
	it('names a round after the day it starts', () => {
		expect(defaultRoundName(new Date(2026, 8, 5))).toBe('Round of 5 September 2026');
	});
});
