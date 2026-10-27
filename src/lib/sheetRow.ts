import { LEVELS, bottleLabel, type BottleState, type Status, type Whiskey } from './db';

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
	'Updated',
	// Optional details, added Oct 2026 after the original columns.
	'Tasted on',
	'Where tasted',
	'Cask / finish',
	'Mash bill',
	'Batch',
	'Bottle size',
	'Released',
	'Region',
	'Your bottle',
	'Bought at',
	'Retail',
	'Buy again'
] as const;

export const LAST_COL = 'Z';

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
		w.updatedAt,
		w.tastedOn,
		w.whereTasted,
		w.cask,
		w.mashBill,
		w.batch,
		w.bottleSize,
		w.released,
		w.region,
		bottleLabel(w),
		w.boughtAt,
		w.retail,
		w.buyAgain === 'yes' ? 'Yes' : w.buyAgain === 'no' ? 'No' : ''
	];
}

/** Reads "Open · 1/4", "open 1/2", "Unopened", … back into a state and level. */
export function parseBottle(text: string): { bottle: BottleState; level: number | null } {
	const t = text.toLowerCase();
	const bottle: BottleState = /unopen|sealed/.test(t)
		? 'unopened'
		: /finish|empty|gone/.test(t)
			? 'finished'
			: /open/.test(t)
				? 'open'
				: /none|no\b/.test(t)
					? 'none'
					: '';
	const lvl = bottle === 'open' ? LEVELS.find((l) => t.includes(l.label.toLowerCase())) : undefined;
	return { bottle, level: lvl?.value ?? null };
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
			updatedAt: str(cells[13]) || now,
			tastedOn: str(cells[14]),
			whereTasted: str(cells[15]),
			cask: str(cells[16]),
			mashBill: str(cells[17]),
			batch: str(cells[18]),
			bottleSize: str(cells[19]),
			released: str(cells[20]),
			region: str(cells[21]),
			...parseBottle(str(cells[22])),
			boughtAt: str(cells[23]),
			retail: str(cells[24]),
			buyAgain: /^y/i.test(str(cells[25])) ? 'yes' : /^n/i.test(str(cells[25])) ? 'no' : ''
		},
		photoLinks: str(cells[11]).split(/\s+/).filter(Boolean)
	};
}

/** A cheap fingerprint of a row's contents, to notice edits made in the sheet. */
export function rowHash(row: unknown[]): string {
	const cells = Array.from({ length: HEADERS.length }, (_, i) => str(row[i]));
	// Trailing blanks are dropped so rows synced before the detail columns
	// existed keep the same fingerprint.
	while (cells.length > 14 && cells.at(-1) === '') cells.pop();
	return JSON.stringify(cells);
}
