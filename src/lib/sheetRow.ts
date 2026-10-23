import type { Status, Whiskey } from './db';

/**
 * The sheet's columns, in order. Human-readable on purpose: people can open
 * the sheet, read it, sort it and even edit it by hand.
 */
export const HEADERS = [
	'ID',
	'Name',
	'Distillery',
	'Type',
	'Age',
	'Proof',
	'Status',
	'Rating',
	'Tasting notes',
	'Tags',
	'Price paid',
	'Photos',
	'Added',
	'Updated'
] as const;

export const LAST_COL = 'N';

const STATUS_LABEL: Record<Status, string> = { tasted: 'Tasted', want: 'Want to try' };

export type Row = (string | number)[];

/** `photoLinks` are Drive links in display order (cover first). */
export function toRow(w: Whiskey, photoLinks: string[]): Row {
	return [
		w.id,
		w.name,
		w.distillery,
		w.type,
		w.age,
		w.proof,
		STATUS_LABEL[w.status],
		w.rating ?? '',
		w.notes,
		w.tags.join(', '),
		w.pricePaid,
		photoLinks.join('\n'),
		w.createdAt,
		w.updatedAt
	];
}

const str = (v: unknown) => (v == null ? '' : String(v)).trim();

export interface ParsedRow {
	id: string;
	fields: Omit<Whiskey, 'id' | 'photoIds' | 'dirty' | 'syncedHash' | 'lastSyncedAt'>;
	photoLinks: string[];
}

export function fromRow(row: unknown[]): ParsedRow | null {
	const cells = Array.from({ length: HEADERS.length }, (_, i) => row[i]);
	const name = str(cells[1]);
	if (!name) return null;
	const status = /^tast/i.test(str(cells[6])) ? 'tasted' : 'want';
	const ratingNum = Number(cells[7]);
	const now = new Date().toISOString();
	return {
		id: str(cells[0]),
		fields: {
			name,
			distillery: str(cells[2]),
			type: str(cells[3]),
			age: str(cells[4]),
			proof: str(cells[5]),
			status,
			rating:
				str(cells[7]) === '' || !Number.isFinite(ratingNum)
					? null
					: Math.min(5, Math.max(0, Math.round(ratingNum * 10) / 10)),
			notes: str(cells[8]),
			tags: str(cells[9])
				.split(',')
				.map((t) => t.trim())
				.filter(Boolean),
			pricePaid: str(cells[10]),
			createdAt: str(cells[12]) || now,
			updatedAt: str(cells[13]) || now
		},
		photoLinks: str(cells[11]).split(/\s+/).filter(Boolean)
	};
}

/** A cheap fingerprint of a row's contents, to notice edits made in the sheet. */
export function rowHash(row: unknown[]): string {
	return JSON.stringify(Array.from({ length: HEADERS.length }, (_, i) => str(row[i])));
}
