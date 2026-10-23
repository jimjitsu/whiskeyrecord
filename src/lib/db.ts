import Dexie, { type EntityTable } from 'dexie';

export type Status = 'tasted' | 'want';

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
	}
}

export const db = new WhiskeyDB();

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
