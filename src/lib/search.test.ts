import { describe, expect, it } from 'vitest';
import { emptyWhiskey, type Whiskey } from './db';
import { createSearch, findLikelyDuplicates, normalize } from './search';

const w = (id: string, name: string, distillery = ''): Whiskey => ({
	...emptyWhiskey(),
	id,
	name,
	distillery
});
const list = [
	w('a', 'Copper Kettle 8 Year', 'Hollow Creek'),
	w('b', 'Old Lantern Straight Rye', 'Lantern Hill'),
	w('c', 'Eagle Rare 10 Year', 'Buffalo Trace'),
	w('d', 'Eagle Rare 17 Year', 'Buffalo Trace')
];

describe('normalize', () => {
	it('drops filler words, accents and punctuation', () => {
		expect(normalize('Kentucky Straight Bourbon Whiskey: Eagle Rare 10 Year')).toBe(
			'eagle rare 10'
		);
		expect(normalize('Ardbèg Uigeadail')).toBe('ardbeg uigeadail');
	});
});

describe('createSearch', () => {
	const search = createSearch(list);
	it('tolerates typos', () => {
		expect(search('coper ketle')[0].id).toBe('a');
	});
	it('matches distillery', () => {
		expect(search('lantern hill').map((x) => x.id)).toContain('b');
	});
	it('returns everything for an empty query', () => {
		expect(search('')).toHaveLength(4);
	});
});

describe('findLikelyDuplicates', () => {
	it('finds close names but not the record itself', () => {
		const dupes = findLikelyDuplicates(list, 'Eagle Rare 10', 'c');
		expect(dupes.map((x) => x.id)).not.toContain('c');
		expect(dupes.map((x) => x.id)).toContain('d');
	});
	it('ignores very short names', () => {
		expect(findLikelyDuplicates(list, 'ea')).toEqual([]);
	});
});
