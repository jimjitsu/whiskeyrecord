import Fuse from 'fuse.js';
import type { Whiskey } from './db';

// Words that appear on lots of labels and add nothing to a match.
const FILLER = new Set([
	'whiskey',
	'whisky',
	'bourbon',
	'straight',
	'kentucky',
	'the',
	'year',
	'years',
	'yr',
	'old',
	'aged',
	'single',
	'malt',
	'barrel'
]);

export function normalize(text: string): string {
	return text
		.toLowerCase()
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^a-z0-9\s]/g, ' ')
		.split(/\s+/)
		.filter((w) => w && !FILLER.has(w))
		.join(' ');
}

interface Indexed {
	w: Whiskey;
	name: string;
	distillery: string;
}

export function createSearch(whiskeys: Whiskey[]) {
	const items: Indexed[] = whiskeys.map((w) => ({
		w,
		name: normalize(w.name),
		distillery: normalize(w.distillery)
	}));
	const fuse = new Fuse(items, {
		keys: [
			{ name: 'name', weight: 0.75 },
			{ name: 'distillery', weight: 0.25 }
		],
		threshold: 0.4,
		ignoreLocation: true,
		includeScore: true
	});

	return (query: string, limit = 50): Whiskey[] => {
		const q = normalize(query);
		if (!q) return whiskeys;
		return fuse.search(q, { limit }).map((r) => r.item.w);
	};
}

/** Close matches for the duplicate check on a new record. Stricter than search. */
export function findLikelyDuplicates(whiskeys: Whiskey[], name: string, excludeId?: string) {
	const q = normalize(name);
	if (q.length < 3) return [];
	const fuse = new Fuse(
		whiskeys.filter((w) => w.id !== excludeId).map((w) => ({ w, name: normalize(w.name) })),
		{ keys: ['name'], threshold: 0.3, ignoreLocation: true }
	);
	return fuse.search(q, { limit: 3 }).map((r) => r.item.w);
}
