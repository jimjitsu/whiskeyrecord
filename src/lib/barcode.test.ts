import { beforeEach, describe, expect, it } from 'vitest';
import { db, emptyWhiskey, findByBarcode, saveWhiskey } from './db';
import { formatBarcode } from './barcode';

describe('findByBarcode', () => {
	beforeEach(async () => {
		await db.whiskeys.clear();
		await saveWhiskey({
			...emptyWhiskey(),
			id: 'a',
			name: 'Copper Kettle',
			barcodes: ['081234567892']
		});
		await saveWhiskey({ ...emptyWhiskey(), id: 'b', name: 'Ember Rye', barcodes: [] });
	});

	it('finds the record a barcode is linked to', async () => {
		expect((await findByBarcode('081234567892')).map((w) => w.id)).toEqual(['a']);
	});

	it('ignores spacing and matches the 13-digit form of a UPC', async () => {
		expect((await findByBarcode('0 81234 56789 2')).map((w) => w.id)).toEqual(['a']);
		expect((await findByBarcode('0081234567892')).map((w) => w.id)).toEqual(['a']);
	});

	it('finds nothing for an unknown barcode', async () => {
		expect(await findByBarcode('5010314100023')).toEqual([]);
		expect(await findByBarcode('')).toEqual([]);
	});
});

describe('formatBarcode', () => {
	it('spaces codes the way they are printed', () => {
		expect(formatBarcode('081234567892')).toBe('0 81234 56789 2');
		expect(formatBarcode('5010314100023')).toBe('5 010314 100023');
		expect(formatBarcode('12345678')).toBe('12345678');
	});
});
