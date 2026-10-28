import { describe, expect, it } from 'vitest';
import { emptyWhiskey, type Whiskey } from './db';
import { HEADERS, fromRow, parseBottle, readTime, rowHash, toRow } from './sheetRow';

const sample = (): Whiskey => ({
	...emptyWhiskey(),
	id: 'wr_test',
	name: 'Copper Kettle 8 Year',
	distillery: 'Hollow Creek',
	type: 'Bourbon',
	age: '8 yr',
	proof: '94',
	status: 'tasted',
	rating: 4.3,
	notes: 'Cherry, toffee',
	tags: ['gift', 'bar pour'],
	pricePaid: '42.99',
	createdAt: '2026-10-01T10:00:00.000Z',
	updatedAt: '2026-10-02T10:00:00.000Z',
	tastedOn: '2026-10-18',
	cask: 'New charred oak',
	bottle: 'open',
	level: 0.25,
	buyAgain: 'yes'
});

describe('toRow / fromRow', () => {
	it('round-trips every field', () => {
		const w = sample();
		const row = toRow(w, ['https://drive.google.com/file/d/abc/view']);
		expect(row).toHaveLength(HEADERS.length);
		const parsed = fromRow(row)!;
		expect(parsed.id).toBe(w.id);
		expect(parsed.photoLinks).toEqual(['https://drive.google.com/file/d/abc/view']);
		for (const key of Object.keys(parsed.fields) as (keyof typeof parsed.fields)[])
			expect(parsed.fields[key], key).toEqual(w[key]);
	});

	it('writes readable labels for status, bottle and buy again', () => {
		const row = toRow(sample(), []);
		expect(row[HEADERS.indexOf('Status')]).toBe('Tasted');
		expect(row[HEADERS.indexOf('Your bottle')]).toBe('Open · 1/4');
		expect(row[HEADERS.indexOf('Buy again')]).toBe('Yes');
	});

	it('reads rows from a sheet made before the detail columns', () => {
		const old = toRow(sample(), []).slice(0, 14);
		const parsed = fromRow(old)!;
		expect(parsed.fields.name).toBe('Copper Kettle 8 Year');
		expect(parsed.fields.bottle).toBe('');
		expect(parsed.fields.cask).toBe('');
	});

	it('skips rows without a name', () => {
		expect(fromRow(['wr_x', '', 'Somewhere'])).toBeNull();
	});

	it('clamps and rounds ratings typed into the sheet', () => {
		const row = toRow(sample(), []);
		row[HEADERS.indexOf('Rating')] = '7.77';
		expect(fromRow(row)!.fields.rating).toBe(5);
		row[HEADERS.indexOf('Rating')] = 'great';
		expect(fromRow(row)!.fields.rating).toBeNull();
	});
});

describe('parseBottle', () => {
	it.each([
		['Open · 1/2', 'open', 0.5],
		['open 3/4', 'open', 0.75],
		['Open', 'open', null],
		['Unopened', 'unopened', null],
		['sealed', 'unopened', null],
		['Finished', 'finished', null],
		['None', 'none', null],
		['', '', null]
	])('%s', (text, bottle, level) => {
		expect(parseBottle(text)).toEqual({ bottle, level });
	});
});

describe('readTime', () => {
	const now = '2026-10-28T00:00:00.000Z';
	it('keeps ISO times as written', () => {
		expect(readTime('2026-10-02T10:00:00Z', now)).toBe('2026-10-02T10:00:00Z');
	});
	it('converts Google day-number serials', () => {
		expect(readTime(46316, now)).toBe('2026-10-21T00:00:00.000Z');
	});
	it('treats unreadable or empty values as now', () => {
		expect(readTime('soon', now)).toBe(now);
		expect(readTime('', now)).toBe(now);
	});
});

describe('rowHash', () => {
	it('matches between an old 14-column row and the same row with empty new columns', () => {
		const full = toRow(
			{ ...sample(), tastedOn: '', cask: '', bottle: '', level: null, buyAgain: '' },
			[]
		);
		expect(rowHash(full)).toBe(rowHash(full.slice(0, 14)));
	});
	it('changes when a cell changes', () => {
		const a = toRow(sample(), []);
		const b = [...a];
		b[1] = 'Something else';
		expect(rowHash(a)).not.toBe(rowHash(b));
	});
});
