/**
 * Thin wrappers over the Google Drive and Sheets REST APIs, called straight
 * from the browser with the user's own token. Only files this app created
 * are visible (the drive.file permission).
 */
const DRIVE = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';

export const TAB = 'Whiskeys';
const APP_KEY = 'whiskeyRecord';

export class GoogleApiError extends Error {
	constructor(
		public status: number,
		message: string
	) {
		super(message);
	}
}

async function call<T>(token: string, url: string, init: RequestInit = {}): Promise<T> {
	const res = await fetch(url, {
		...init,
		headers: {
			Authorization: `Bearer ${token}`,
			...(init.body && typeof init.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
			...init.headers
		}
	});
	if (!res.ok) {
		let message = res.statusText;
		try {
			message = (await res.json()).error?.message ?? message;
		} catch {
			/* not JSON */
		}
		throw new GoogleApiError(res.status, message);
	}
	if (res.status === 204) return undefined as T;
	const type = res.headers.get('content-type') ?? '';
	return (type.includes('json') ? res.json() : res.blob()) as Promise<T>;
}

export interface DriveFile {
	id: string;
	name: string;
	webViewLink?: string;
	trashed?: boolean;
}

/** Finds a file this app created earlier (on any device), tagged with appProperties. */
export async function findAppFile(token: string, kind: 'sheet' | 'photos') {
	const q = `appProperties has { key='${APP_KEY}' and value='${kind}' } and trashed = false`;
	const url = `${DRIVE}/files?q=${encodeURIComponent(q)}&orderBy=createdTime&fields=files(id,name,webViewLink)`;
	const { files } = await call<{ files: DriveFile[] }>(token, url);
	return files[0] ?? null;
}

export function getFile(token: string, id: string) {
	return call<DriveFile>(token, `${DRIVE}/files/${id}?fields=id,name,trashed,webViewLink`);
}

function tag(token: string, id: string, kind: 'sheet' | 'photos') {
	return call(token, `${DRIVE}/files/${id}`, {
		method: 'PATCH',
		body: JSON.stringify({ appProperties: { [APP_KEY]: kind } })
	});
}

export async function createSheet(token: string, headers: string[]) {
	const created = await call<{
		spreadsheetId: string;
		spreadsheetUrl: string;
		sheets: { properties: { sheetId: number } }[];
	}>(token, SHEETS, {
		method: 'POST',
		body: JSON.stringify({
			properties: { title: 'Whiskey Record' },
			sheets: [
				{
					properties: { title: TAB, gridProperties: { frozenRowCount: 1 } },
					data: [
						{
							rowData: [
								{
									values: headers.map((h) => ({
										userEnteredValue: { stringValue: h },
										userEnteredFormat: { textFormat: { bold: true } }
									}))
								}
							]
						}
					]
				}
			]
		})
	});
	await tag(token, created.spreadsheetId, 'sheet');
	return {
		id: created.spreadsheetId,
		url: created.spreadsheetUrl,
		gid: created.sheets[0].properties.sheetId
	};
}

export async function createFolder(token: string) {
	const folder = await call<DriveFile>(token, `${DRIVE}/files?fields=id,name,webViewLink`, {
		method: 'POST',
		body: JSON.stringify({
			name: 'Whiskey Record Photos',
			mimeType: 'application/vnd.google-apps.folder',
			appProperties: { [APP_KEY]: 'photos' }
		})
	});
	return folder;
}

/** The numeric id of the Whiskeys tab, needed to delete rows. */
export async function getTabGid(token: string, sheetId: string): Promise<number | null> {
	const r = await call<{ sheets: { properties: { sheetId: number; title: string } }[] }>(
		token,
		`${SHEETS}/${sheetId}?fields=sheets.properties(sheetId,title)`
	);
	return r.sheets.find((s) => s.properties.title === TAB)?.properties.sheetId ?? null;
}

export async function readRows(token: string, sheetId: string): Promise<unknown[][]> {
	const r = await call<{ values?: unknown[][] }>(
		token,
		`${SHEETS}/${sheetId}/values/${encodeURIComponent(`${TAB}!A1:Z`)}?valueRenderOption=UNFORMATTED_VALUE`
	);
	return r.values ?? [];
}

export function updateRows(
	token: string,
	sheetId: string,
	data: { range: string; values: unknown[][] }[]
) {
	return call(token, `${SHEETS}/${sheetId}/values:batchUpdate`, {
		method: 'POST',
		body: JSON.stringify({ valueInputOption: 'RAW', data })
	});
}

export function appendRows(token: string, sheetId: string, values: unknown[][]) {
	const range = encodeURIComponent(`${TAB}!A1`);
	return call(
		token,
		`${SHEETS}/${sheetId}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
		{ method: 'POST', body: JSON.stringify({ values }) }
	);
}

/** Deletes rows by 0-based index (header is row 0). */
export function deleteRows(token: string, sheetId: string, gid: number, rowIndexes: number[]) {
	const requests = [...rowIndexes]
		.sort((a, b) => b - a)
		.map((i) => ({
			deleteDimension: {
				range: { sheetId: gid, dimension: 'ROWS', startIndex: i, endIndex: i + 1 }
			}
		}));
	return call(token, `${SHEETS}/${sheetId}:batchUpdate`, {
		method: 'POST',
		body: JSON.stringify({ requests })
	});
}

export async function uploadPhoto(token: string, folderId: string, name: string, blob: Blob) {
	const meta = { name, parents: [folderId], mimeType: blob.type || 'image/jpeg' };
	const body = new FormData();
	body.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
	body.append('file', blob);
	const r = await call<{ id: string }>(token, `${UPLOAD}/files?uploadType=multipart&fields=id`, {
		method: 'POST',
		body
	});
	return r.id;
}

export function downloadPhoto(token: string, id: string) {
	return call<Blob>(token, `${DRIVE}/files/${id}?alt=media`);
}

export function photoLink(id: string) {
	return `https://drive.google.com/file/d/${id}/view`;
}

export function photoIdFromLink(link: string): string | null {
	return /\/d\/([\w-]+)/.exec(link)?.[1] ?? null;
}
