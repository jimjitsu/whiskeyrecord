import Dexie, { type EntityTable } from 'dexie';

export type Status = 'tasted' | 'want';
/** Whether you own a bottle, and what state it's in. '' = not filled in. */
export type BottleState = '' | 'none' | 'unopened' | 'open' | 'finished';
/** Rough level of an open bottle. */
export const LEVELS = [
	{ value: 0.75, label: '3/4' },
	{ value: 0.5, label: '1/2' },
	{ value: 0.25, label: '1/4' },
	{ value: 0.1, label: 'Low' }
] as const;

/** One row per whiskey; mirrors the columns of the user's Google Sheet. */
export interface Whiskey {
	id: string;
	name: string;
	distillery: string;
	type: string;
	age: string;
	proof: string;
	status: Status;
	/** 0–5 in 0.1 steps; null until rated. Only meaningful when tasted. */
	rating: number | null;
	notes: string;
	tags: string[];
	/** Price paid, as typed. */
	pricePaid: string;

	// Optional details (added Oct 2026). Empty strings when not filled in.
	tastedOn: string;
	whereTasted: string;
	cask: string;
	mashBill: string;
	batch: string;
	bottleSize: string;
	released: string;
	region: string;
	bottle: BottleState;
	/** Level of an open bottle (see LEVELS); null when not open or not set. */
	level: number | null;
	/** Where it was bought, or seen for sale while still Want to try. */
	boughtAt: string;
	retail: string;
	buyAgain: '' | 'yes' | 'no';
	/** Photo ids in display order; the first is the cover. */
	photoIds: string[];
	createdAt: string;
	updatedAt: string;
	/** 1 until this row has been written to the Google Sheet. */
	dirty: 0 | 1;
	/** The sheet row as last synced; used to spot edits made in the sheet itself. */
	syncedHash?: string;
	/** Set once the row has existed in the sheet. */
	lastSyncedAt?: string;
}

/** Photos live in their own table so loading the list stays light. */
export interface Photo {
	id: string;
	/** Missing for photos synced from another device until first viewed. */
	blob?: Blob;
	/** Set once uploaded to the Drive photo folder. */
	driveFileId?: string;
}

class WhiskeyDB extends Dexie {
	whiskeys!: EntityTable<Whiskey, 'id'>;
	photos!: EntityTable<Photo, 'id'>;
	/** Deleted records that still need removing from the sheet. */
	deletions!: EntityTable<{ id: string }, 'id'>;

	constructor() {
		super('whiskey-record');
		this.version(1).stores({
			whiskeys: 'id, name, distillery, status, updatedAt, dirty',
			photos: 'id'
		});
		this.version(2).stores({
			photos: 'id, driveFileId',
			deletions: 'id'
		});
		// New optional detail fields: fill them in on existing rows.
		this.version(3)
			.stores({})
			.upgrade((tx) =>
				tx
					.table('whiskeys')
					.toCollection()
					.modify((w: Whiskey) => {
						Object.assign(w, { ...DETAIL_DEFAULTS, ...w });
					})
			);
	}
}

export const DETAIL_DEFAULTS = {
	tastedOn: '',
	whereTasted: '',
	cask: '',
	mashBill: '',
	batch: '',
	bottleSize: '',
	released: '',
	region: '',
	bottle: '',
	level: null,
	boughtAt: '',
	retail: '',
	buyAgain: ''
} satisfies Partial<Whiskey>;

export const db = new WhiskeyDB();

/** Bought before and would buy again, and the bottle is low or gone. */
export function isRunningLow(w: Whiskey): boolean {
	if (w.buyAgain !== 'yes') return false;
	return w.bottle === 'finished' || (w.bottle === 'open' && w.level != null && w.level <= 0.25);
}

/** "Open · 1/4", "Unopened", … as shown in the sheet and on the record. */
export function bottleLabel(w: Pick<Whiskey, 'bottle' | 'level'>): string {
	if (!w.bottle) return '';
	const base = { none: 'None', unopened: 'Unopened', open: 'Open', finished: 'Finished' }[w.bottle];
	const lvl = w.bottle === 'open' && LEVELS.find((l) => l.value === w.level);
	return lvl ? `${base} · ${lvl.label}` : base;
}

// Lets the sync engine know something changed on this device.
const listeners = new Set<() => void>();
export function onLocalChange(fn: () => void): () => void {
	listeners.add(fn);
	return () => listeners.delete(fn);
}
function changed() {
	listeners.forEach((fn) => fn());
}

export function newId(prefix = 'wr'): string {
	return `${prefix}_${crypto.randomUUID().replaceAll('-', '').slice(0, 10)}`;
}

export function emptyWhiskey(): Whiskey {
	const now = new Date().toISOString();
	return {
		id: newId(),
		name: '',
		distillery: '',
		type: '',
		age: '',
		proof: '',
		status: 'want',
		rating: null,
		notes: '',
		tags: [],
		pricePaid: '',
		...DETAIL_DEFAULTS,
		photoIds: [],
		createdAt: now,
		updatedAt: now,
		dirty: 1
	};
}

export async function saveWhiskey(w: Whiskey): Promise<void> {
	await db.whiskeys.put({ ...w, updatedAt: new Date().toISOString(), dirty: 1 });
	changed();
}

/** Partial update used by the instant-save actions (status, rating). */
export async function patchWhiskey(id: string, changes: Partial<Whiskey>): Promise<void> {
	await db.whiskeys.update(id, { ...changes, updatedAt: new Date().toISOString(), dirty: 1 });
	changed();
}

export async function deleteWhiskey(id: string): Promise<void> {
	const w = await db.whiskeys.get(id);
	await db.transaction('rw', db.whiskeys, db.photos, db.deletions, async () => {
		if (w) await db.photos.bulkDelete(w.photoIds);
		if (w?.lastSyncedAt) await db.deletions.put({ id });
		await db.whiskeys.delete(id);
	});
	changed();
}

export async function addPhotos(blobs: Blob[]): Promise<string[]> {
	const rows = blobs.map((blob) => ({ id: newId('ph'), blob }));
	await db.photos.bulkAdd(rows);
	return rows.map((r) => r.id);
}

/** Types already used, for the Type field's suggestions. */
export async function usedTypes(): Promise<string[]> {
	const all = await db.whiskeys.toArray();
	const seen = new Map<string, string>();
	for (const t of [...all.map((w) => w.type), ...COMMON_TYPES]) {
		const key = t.trim().toLowerCase();
		if (key && !seen.has(key)) seen.set(key, t.trim());
	}
	return [...seen.values()];
}

const COMMON_TYPES = ['Bourbon', 'Rye', 'Scotch', 'Irish', 'Japanese', 'American single malt'];
