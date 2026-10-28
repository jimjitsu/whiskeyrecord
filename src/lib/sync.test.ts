import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Whiskey } from './db';

// An in-memory Google Sheet standing in for the Sheets and Drive APIs.
const sheet = vi.hoisted(() => {
	const state = {
		rows: [] as unknown[][],
		/** Runs once, right before the ID check, to simulate someone sorting the sheet mid-sync. */
		beforeIdCheck: null as null | (() => void),
		idChecks: 0
	};
	return state;
});

vi.mock('./google/auth.svelte', () => ({ getToken: () => 'token' }));
vi.mock('./google/api', () => {
	class GoogleApiError extends Error {
		constructor(
			public status: number,
			message: string
		) {
			super(message);
		}
	}
	const rowOf = (range: string) => Number(range.split('!')[1].match(/\d+/)![0]);
	return {
		GoogleApiError,
		TAB: 'Whiskeys',
		getFile: async () => ({ id: 'sheet', name: 'Whiskey Record', trashed: false }),
		readRows: async () => sheet.rows.map((r) => [...r]),
		readIds: async () => {
			sheet.idChecks++;
			const hook = sheet.beforeIdCheck;
			sheet.beforeIdCheck = null;
			hook?.();
			return sheet.rows.map((r) => String(r[0] ?? ''));
		},
		updateRows: async (_t: string, _s: string, data: { range: string; values: unknown[][] }[]) => {
			for (const d of data) sheet.rows[rowOf(d.range) - 1] = d.values[0];
		},
		appendRows: async (_t: string, _s: string, rows: unknown[][]) => {
			sheet.rows.push(...rows);
		},
		deleteRows: async (_t: string, _s: string, _g: number, idx: number[]) => {
			for (const i of [...idx].sort((a, b) => b - a)) sheet.rows.splice(i, 1);
		},
		uploadPhoto: async () => 'drive-photo',
		photoLink: (id: string) => `https://drive.google.com/file/d/${id}/view`,
		photoIdFromLink: (l: string) => l.match(/\/d\/([^/]+)/)?.[1] ?? null,
		createSheet: vi.fn(),
		createFolder: vi.fn(),
		findAppFile: vi.fn(),
		getTabGid: vi.fn()
	};
});

localStorage.setItem(
	'whiskey-record:google',
	JSON.stringify({ sheetId: 'sheet', sheetUrl: 'https://x', gid: 0, folderId: 'folder' })
);
Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });

const { db, emptyWhiskey, saveWhiskey, deleteWhiskey } = await import('./db');
const { HEADERS, toRow } = await import('./sheetRow');
const { sync, syncNow } = await import('./sync.svelte');

const record = (id: string, name: string, extra: Partial<Whiskey> = {}): Whiskey => ({
	...emptyWhiskey(),
	id,
	name,
	createdAt: '2026-10-01T00:00:00.000Z',
	updatedAt: '2026-10-01T00:00:00.000Z',
	...extra
});
const sheetRow = (id: string, name: string, extra: Partial<Whiskey> = {}) =>
	toRow(record(id, name, extra), []);
const names = () => sheet.rows.slice(1).map((r) => r[1]);

beforeEach(async () => {
	sheet.rows = [[...HEADERS]];
	sheet.beforeIdCheck = null;
	sheet.idChecks = 0;
	await db.whiskeys.clear();
	await db.photos.clear();
	await db.deletions.clear();
});

describe('sync', () => {
	it('pushes a record made on this device', async () => {
		await saveWhiskey(record('wr_a', 'Copper Kettle'));
		await syncNow();
		expect(sync.status).toBe('idle');
		expect(names()).toEqual(['Copper Kettle']);
		expect((await db.whiskeys.get('wr_a'))?.dirty).toBe(0);
	});

	it('pulls a row added on another device', async () => {
		sheet.rows.push(sheetRow('wr_b', 'Grey Heron 12'));
		await syncNow();
		expect((await db.whiskeys.get('wr_b'))?.name).toBe('Grey Heron 12');
	});

	it('gives a hand-typed row an ID and pulls it in', async () => {
		sheet.rows.push(['', 'Typed By Hand', 'Somewhere']);
		await syncNow();
		const all = await db.whiskeys.toArray();
		expect(all.map((w) => w.name)).toEqual(['Typed By Hand']);
		expect(sheet.rows[1][0]).toBe(all[0].id);
	});

	it('takes an edit made in the sheet', async () => {
		await saveWhiskey(record('wr_a', 'Copper Kettle'));
		await syncNow();
		sheet.rows[1][2] = 'Edited Distillery';
		sheet.rows[1][13] = '2026-10-05T00:00:00.000Z';
		await syncNow();
		expect((await db.whiskeys.get('wr_a'))?.distillery).toBe('Edited Distillery');
	});

	it('deletes the row when the record is deleted here', async () => {
		await saveWhiskey(record('wr_a', 'Copper Kettle'));
		await saveWhiskey(record('wr_b', 'Grey Heron'));
		await syncNow();
		await deleteWhiskey('wr_a');
		await syncNow();
		expect(names()).toEqual(['Grey Heron']);
	});

	it('writes to the right rows when the sheet is sorted mid-sync', async () => {
		for (const [id, name] of [
			['wr_a', 'Alpha'],
			['wr_b', 'Bravo'],
			['wr_c', 'Charlie']
		])
			await saveWhiskey(record(id, name));
		await syncNow();
		// Edit Alpha here, then have someone reverse-sort the sheet before the write.
		const a = (await db.whiskeys.get('wr_a'))!;
		await saveWhiskey({ ...a, notes: 'edited here' });
		sheet.beforeIdCheck = () => {
			sheet.rows = [sheet.rows[0], ...sheet.rows.slice(1).reverse()];
		};
		await syncNow();
		expect(sync.status).toBe('idle');
		expect(sheet.idChecks).toBeGreaterThanOrEqual(2);
		const byId = Object.fromEntries(sheet.rows.slice(1).map((r) => [r[0], r]));
		expect(byId.wr_a[1]).toBe('Alpha');
		expect(byId.wr_a[8]).toBe('edited here');
		expect(byId.wr_c[1]).toBe('Charlie');
		expect(byId.wr_c[8]).toBe('');
	});

	it('puts a record back when its name is cleared in the sheet', async () => {
		await saveWhiskey(record('wr_a', 'Copper Kettle'));
		await syncNow();
		sheet.rows[1][1] = '';
		await syncNow();
		expect(sheet.rows[1][1]).toBe('Copper Kettle');
		expect((await db.whiskeys.get('wr_a'))?.name).toBe('Copper Kettle');
	});

	it('reads an Updated date that Google turned into a day number', async () => {
		await saveWhiskey(record('wr_a', 'Copper Kettle'));
		await syncNow();
		sheet.rows[1][2] = 'Edited';
		sheet.rows[1][13] = 46400; // 2027: newer than the local copy
		await syncNow();
		const w = (await db.whiskeys.get('wr_a'))!;
		expect(w.distillery).toBe('Edited');
		expect(w.updatedAt.startsWith('2027-')).toBe(true);
	});

	it('adds the new detail columns to an old sheet header', async () => {
		sheet.rows = [HEADERS.slice(0, 14)];
		await syncNow();
		expect(sheet.rows[0]).toEqual([...HEADERS]);
	});
});
