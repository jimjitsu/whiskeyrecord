import { db, deleteWhiskey, type Whiskey } from './db';

/** What the "Saved · Undo" toast needs to put things back. */
export interface UndoEntry {
	id: string;
	/** Version before the save; null means the record was new. */
	previous: Whiskey | null;
	/** Photos removed by the save; deleted for good once Undo expires. */
	droppedPhotoIds: string[];
}

const KEY = 'whiskey-record:undo';

export function setUndo(entry: UndoEntry) {
	try {
		sessionStorage.setItem(KEY, JSON.stringify(entry));
	} catch {
		/* ignore */
	}
}

export function takeUndo(): UndoEntry | null {
	try {
		const raw = sessionStorage.getItem(KEY);
		sessionStorage.removeItem(KEY);
		return raw ? (JSON.parse(raw) as UndoEntry) : null;
	} catch {
		return null;
	}
}

export async function applyUndo(entry: UndoEntry): Promise<'deleted' | 'restored'> {
	if (!entry.previous) {
		await deleteWhiskey(entry.id);
		return 'deleted';
	}
	await db.whiskeys.put({ ...entry.previous, dirty: 1, updatedAt: new Date().toISOString() });
	return 'restored';
}

/** Undo window closed: remove photos the save dropped. */
export async function finalizeUndo(entry: UndoEntry) {
	if (entry.droppedPhotoIds.length) await db.photos.bulkDelete(entry.droppedPhotoIds);
}
