import { db, newId, onLocalChange, type Photo, type Whiskey } from './db';
import { getToken } from './google/auth.svelte';
import {
	GoogleApiError,
	TAB,
	appendRows,
	createFolder,
	createSheet,
	deleteRows,
	findAppFile,
	getFile,
	getTabGid,
	photoIdFromLink,
	photoLink,
	readRows,
	updateRows,
	uploadPhoto
} from './google/api';
import { HEADERS, LAST_COL, fromRow, rowHash, toRow, type Row } from './sheetRow';

/**
 * Two-way sync between the copy on this device (IndexedDB) and the user's
 * Google Sheet. The sheet is the source of truth; the device copy makes search
 * and offline entry work.
 *
 * Rules, one row per whiskey, matched by the hidden ID column:
 * - Changed only here → push. Changed only in the sheet → pull.
 * - Changed in both → the newer "Updated" time wins.
 * - Deleted here → delete the row. Row gone from the sheet → delete here.
 * - Row typed into the sheet by hand (no ID) → given an ID and pulled in.
 */

export interface SheetConfig {
	sheetId: string;
	sheetUrl: string;
	gid: number;
	folderId: string;
}

const CONFIG_KEY = 'whiskey-record:google';

function readConfig(): SheetConfig | null {
	try {
		const raw = localStorage.getItem(CONFIG_KEY);
		return raw ? (JSON.parse(raw) as SheetConfig) : null;
	} catch {
		return null;
	}
}

function writeConfig(c: SheetConfig | null) {
	try {
		if (c) localStorage.setItem(CONFIG_KEY, JSON.stringify(c));
		else localStorage.removeItem(CONFIG_KEY);
	} catch {
		/* ignore */
	}
}

export type SyncStatus =
	'off' | 'idle' | 'syncing' | 'needs-auth' | 'offline' | 'missing' | 'error';

export const sync = $state({
	config: readConfig(),
	status: (readConfig() ? 'idle' : 'off') as SyncStatus,
	message: '',
	unsynced: 0,
	lastSyncedAt: null as string | null
});

async function countUnsynced() {
	sync.unsynced =
		(await db.whiskeys.where('dirty').equals(1).count()) + (await db.deletions.count());
}

/**
 * Finds the user's existing Whiskey Record sheet (made on any device) or
 * creates a new sheet and photo folder. Needs a fresh token from a tap.
 */
export async function connectSheet(token: string): Promise<'found' | 'created'> {
	const [existing, existingFolder] = await Promise.all([
		findAppFile(token, 'sheet'),
		findAppFile(token, 'photos')
	]);
	const folder = existingFolder ?? (await createFolder(token));
	let config: SheetConfig;
	let result: 'found' | 'created';
	if (existing) {
		const gid = await getTabGid(token, existing.id);
		config = {
			sheetId: existing.id,
			sheetUrl: existing.webViewLink ?? `https://docs.google.com/spreadsheets/d/${existing.id}`,
			gid: gid ?? 0,
			folderId: folder.id
		};
		result = 'found';
	} else {
		const sheet = await createSheet(token, [...HEADERS]);
		config = { sheetId: sheet.id, sheetUrl: sheet.url, gid: sheet.gid, folderId: folder.id };
		result = 'created';
	}
	// Everything on this device goes up on the first sync.
	await db.whiskeys.toCollection().modify({ dirty: 1 });
	writeConfig(config);
	sync.config = config;
	sync.status = 'idle';
	return result;
}

/** Forgets the sheet on this device. The sheet itself stays in Drive. */
export function disconnectSheet() {
	writeConfig(null);
	sync.config = null;
	sync.status = 'off';
	sync.message = '';
}

/** Makes a fresh sheet after the old one went missing; re-uploads this device's records. */
export async function replaceMissingSheet(token: string) {
	writeConfig(null);
	sync.config = null;
	await db.whiskeys.toCollection().modify((w) => {
		w.dirty = 1;
		delete w.lastSyncedAt;
		delete w.syncedHash;
	});
	await db.deletions.clear();
	return connectSheet(token);
}

let running: Promise<void> | null = null;
let again = false;

/** Runs a sync now (or right after the current one finishes). */
export function syncNow(): Promise<void> {
	if (running) {
		again = true;
		return running;
	}
	running = (async () => {
		do {
			again = false;
			await runOnce();
		} while (again);
	})().finally(() => {
		running = null;
	});
	return running;
}

let timer: ReturnType<typeof setTimeout> | undefined;
function syncSoon() {
	clearTimeout(timer);
	timer = setTimeout(() => syncNow(), 1500);
}

/** Wires up automatic syncing: on start, after local changes, when back online or reopened. */
export function startAutoSync() {
	const offChange = onLocalChange(() => {
		countUnsynced();
		syncSoon();
	});
	const online = () => syncNow();
	const visible = () => document.visibilityState === 'visible' && syncNow();
	window.addEventListener('online', online);
	document.addEventListener('visibilitychange', visible);
	countUnsynced();
	syncNow();
	return () => {
		offChange();
		window.removeEventListener('online', online);
		document.removeEventListener('visibilitychange', visible);
	};
}

async function runOnce() {
	await countUnsynced();
	const config = sync.config;
	if (!config) {
		sync.status = 'off';
		return;
	}
	if (!navigator.onLine) {
		sync.status = 'offline';
		return;
	}
	const token = getToken();
	if (!token) {
		sync.status = 'needs-auth';
		return;
	}
	sync.status = 'syncing';
	sync.message = '';
	try {
		const file = await getFile(token, config.sheetId);
		if (file.trashed) throw new GoogleApiError(404, 'trashed');
		await reconcile(token, config);
		sync.status = 'idle';
		sync.lastSyncedAt = new Date().toISOString();
	} catch (e) {
		if (e instanceof GoogleApiError && e.status === 401) {
			sync.status = 'needs-auth';
		} else if (e instanceof GoogleApiError && e.status === 404) {
			sync.status = 'missing';
			sync.message = "Your Whiskey Record sheet couldn't be found. It may have been deleted.";
		} else if (!navigator.onLine) {
			sync.status = 'offline';
		} else {
			sync.status = 'error';
			sync.message = e instanceof Error ? e.message : 'Sync failed';
		}
	}
	await countUnsynced();
}

async function reconcile(token: string, config: SheetConfig) {
	const values = await readRows(token, config.sheetId);
	const header = values[0] ?? [];
	if (header.length === 0) {
		// Empty tab (e.g. cleared by hand): put the header back.
		await updateRows(token, config.sheetId, [
			{ range: `${TAB}!A1:${LAST_COL}1`, values: [[...HEADERS]] }
		]);
	}

	// Remote rows by id, with their sheet row number (1-based; header is 1).
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local lookup table, not UI state
	const remote = new Map<string, { rowNum: number; raw: unknown[] }>();
	const handTyped: { rowNum: number; raw: unknown[] }[] = [];
	values.slice(1).forEach((raw, i) => {
		const rowNum = i + 2;
		const id = String(raw[0] ?? '').trim();
		if (id) remote.set(id, { rowNum, raw });
		else if (String(raw[1] ?? '').trim()) handTyped.push({ rowNum, raw });
	});

	const locals = await db.whiskeys.toArray();
	const localById = new Map(locals.map((w) => [w.id, w]));
	const tombstones = new Set((await db.deletions.toArray()).map((d) => d.id));

	const toUpdate: { rowNum: number; w: Whiskey }[] = [];
	const toAppend: Whiskey[] = [];
	const rowDeletes: number[] = [];

	// 1. Deletions made on this device.
	for (const id of tombstones) {
		const r = remote.get(id);
		if (r) rowDeletes.push(r.rowNum - 1);
		remote.delete(id);
	}

	// 2. Rows in the sheet.
	for (const [id, r] of remote) {
		const local = localById.get(id);
		const parsed = fromRow(r.raw);
		if (!parsed) continue;
		const hash = rowHash(r.raw);
		if (!local) {
			await pullInto(null, id, parsed, hash);
			continue;
		}
		const remoteChanged = hash !== local.syncedHash;
		const takeRemote = remoteChanged && (!local.dirty || parsed.fields.updatedAt > local.updatedAt);
		if (takeRemote) {
			await pullInto(local, id, parsed, hash);
		} else if (local.dirty) {
			toUpdate.push({ rowNum: r.rowNum, w: local });
		}
	}

	// 3. Records only on this device.
	for (const w of locals) {
		if (remote.has(w.id)) continue;
		if (w.lastSyncedAt && !w.dirty) {
			// It was in the sheet and someone deleted the row there.
			await db.transaction('rw', db.whiskeys, db.photos, async () => {
				await db.photos.bulkDelete(w.photoIds);
				await db.whiskeys.delete(w.id);
			});
		} else {
			toAppend.push(w);
		}
	}

	// 4. Rows typed into the sheet by hand: give them an ID, pull them in.
	for (const r of handTyped) {
		const parsed = fromRow(r.raw);
		if (!parsed) continue;
		const id = newId();
		const w = await pullInto(null, id, parsed, '');
		toUpdate.push({ rowNum: r.rowNum, w });
	}

	// Upload photos and build rows for everything being written.
	const now = new Date().toISOString();
	const written: { w: Whiskey; row: Row }[] = [];
	const updates: { range: string; values: Row[] }[] = [];
	for (const { rowNum, w } of toUpdate) {
		const row = toRow(w, await photoLinks(token, config, w));
		updates.push({ range: `${TAB}!A${rowNum}:${LAST_COL}${rowNum}`, values: [row] });
		written.push({ w, row });
	}
	const appendRowsData: Row[] = [];
	for (const w of toAppend) {
		const row = toRow(w, await photoLinks(token, config, w));
		appendRowsData.push(row);
		written.push({ w, row });
	}

	if (updates.length) await updateRows(token, config.sheetId, updates);
	if (appendRowsData.length) await appendRows(token, config.sheetId, appendRowsData);
	if (rowDeletes.length) await deleteRows(token, config.sheetId, config.gid, rowDeletes);

	// Mark what was written as synced (unless it changed again meanwhile).
	await db.transaction('rw', db.whiskeys, db.deletions, async () => {
		for (const { w, row } of written) {
			const current = await db.whiskeys.get(w.id);
			if (!current) continue;
			const unchanged = current.updatedAt === w.updatedAt;
			await db.whiskeys.update(w.id, {
				syncedHash: rowHash(row),
				lastSyncedAt: now,
				...(unchanged ? { dirty: 0 as const } : {})
			});
		}
		await db.deletions.bulkDelete([...tombstones]);
	});
}

/** Copies a sheet row into the device copy, keeping photos that are already here. */
async function pullInto(
	local: Whiskey | null,
	id: string,
	parsed: NonNullable<ReturnType<typeof fromRow>>,
	hash: string
): Promise<Whiskey> {
	const driveIds = parsed.photoLinks.map(photoIdFromLink).filter((x): x is string => !!x);
	const known = driveIds.length
		? await db.photos.where('driveFileId').anyOf(driveIds).toArray()
		: [];
	const byDrive = new Map(known.map((p) => [p.driveFileId!, p]));
	const stubs: Photo[] = [];
	const photoIds = driveIds.map((d) => {
		const hit = byDrive.get(d);
		if (hit) return hit.id;
		const stub = { id: newId('ph'), driveFileId: d };
		stubs.push(stub);
		return stub.id;
	});
	const w: Whiskey = {
		id,
		...parsed.fields,
		photoIds,
		dirty: 0,
		syncedHash: hash,
		lastSyncedAt: new Date().toISOString()
	};
	await db.transaction('rw', db.whiskeys, db.photos, async () => {
		if (stubs.length) await db.photos.bulkAdd(stubs);
		const dropped = (local?.photoIds ?? []).filter((p) => !photoIds.includes(p));
		if (dropped.length) await db.photos.bulkDelete(dropped);
		await db.whiskeys.put(w);
	});
	return w;
}

/** Uploads any photos not yet in Drive and returns their links, cover first. */
async function photoLinks(token: string, config: SheetConfig, w: Whiskey): Promise<string[]> {
	const links: string[] = [];
	for (const [i, pid] of w.photoIds.entries()) {
		const p = await db.photos.get(pid);
		if (!p) continue;
		let driveId = p.driveFileId;
		if (!driveId && p.blob) {
			const safe =
				w.name
					.replace(/[^\w\s-]/g, '')
					.trim()
					.slice(0, 60) || 'whiskey';
			driveId = await uploadPhoto(token, config.folderId, `${safe} ${i + 1}.jpg`, p.blob);
			await db.photos.update(pid, { driveFileId: driveId });
		}
		if (driveId) links.push(photoLink(driveId));
	}
	return links;
}
