import { describe, expect, it } from 'vitest';
import { commonsFileName, imageIdentityKey } from './identity';

describe('commonsFileName', () => {
	it('reads the file behind a thumbnail rendering', () => {
		expect(
			commonsFileName(
				'https://thumb.wikimedia.org/wikipedia/commons/thumb/8/81/3_BMW_R1300GS_2024-06-07_v2.jpg/1280px-3_BMW_R1300GS_2024-06-07_v2.jpg?utm_source=de.wikipedia.org'
			)
		).toBe('3_BMW_R1300GS_2024-06-07_v2.jpg');
	});

	it('reads the file behind an original upload and decodes it', () => {
		expect(
			commonsFileName(
				'https://upload.wikimedia.org/wikipedia/commons/4/49/Sal%C3%A3o_Duas_Rodas_2017_%2838466478676%29.jpg?utm_source=de.wikipedia.org'
			)
		).toBe('Salão_Duas_Rodas_2017_(38466478676).jpg');
	});

	it('answers null for other hosts', () => {
		expect(commonsFileName('https://www.honda.nl/content/dam/x/25YM_CMX500.png')).toBeNull();
	});
});

describe('imageIdentityKey', () => {
	it('collides the same Commons file reached by two wikis and two renderings', () => {
		const a = imageIdentityKey(
			'https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f8/Honda_CMX500_Rebel_Portray.jpg/1280px-Honda_CMX500_Rebel_Portray.jpg?utm_source=commons.wikimedia.org'
		);
		const b = imageIdentityKey(
			'https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f8/Honda_CMX500_Rebel_Portray.jpg/1280px-Honda_CMX500_Rebel_Portray.jpg?utm_source=de.wikipedia.org'
		);
		const c = imageIdentityKey(
			'https://upload.wikimedia.org/wikipedia/commons/f/f8/Honda_CMX500_Rebel_Portray.jpg'
		);
		expect(a).toBe(b);
		expect(b).toBe(c);
	});

	it('keeps different files apart', () => {
		expect(imageIdentityKey('https://upload.wikimedia.org/wikipedia/commons/8/88/A.jpg')).not.toBe(
			imageIdentityKey('https://upload.wikimedia.org/wikipedia/commons/8/88/B.jpg')
		);
	});

	it('ignores only the query string on other hosts', () => {
		expect(imageIdentityKey('https://cdn.example/x.png?v=2')).toBe('https://cdn.example/x.png');
		expect(imageIdentityKey('https://cdn.example/x.png')).not.toBe(
			imageIdentityKey('https://cdn.example/y.png')
		);
	});
});
