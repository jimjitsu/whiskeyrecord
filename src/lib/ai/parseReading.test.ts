import { describe, expect, it } from 'vitest';
import { parseReading } from './openrouter.svelte';

const core = {
	name: 'Eagle Rare 10 Year',
	distillery: 'Buffalo Trace',
	type: 'Bourbon',
	age: '10 yr',
	proof: '90'
};

describe('parseReading', () => {
	it('reads plain JSON', () => {
		expect(parseReading(JSON.stringify(core))).toEqual(core);
	});
	it('reads JSON inside code fences and chatter', () => {
		expect(
			parseReading('Sure! ```json\n' + JSON.stringify(core) + '\n``` Hope that helps')
		).toEqual(core);
	});
	it('repairs trailing commas and single quotes', () => {
		const text =
			"{'name': 'Eagle Rare 10 Year', 'distillery': 'Buffalo Trace', 'type': 'Bourbon', 'age': '10 yr', 'proof': '90',}";
		expect(parseReading(text)).toEqual(core);
	});
	it('strips "proof" and fills missing fields with empty text', () => {
		expect(parseReading('{"name": "X", "proof": "100 proof"}')).toEqual({
			name: 'X',
			distillery: '',
			type: '',
			age: '',
			proof: '100'
		});
	});
	it('falls back to picking fields out one by one', () => {
		const r = parseReading('name: Eagle Rare 10 Year\ndistillery: Buffalo Trace');
		expect(r?.name).toBe('Eagle Rare 10 Year');
		expect(r?.distillery).toBe('Buffalo Trace');
	});
	it('returns null when nothing usable is there', () => {
		expect(parseReading('I cannot see a bottle.')).toBeNull();
	});
	it('reads the bottle-details fields when asked for them', () => {
		const fields = ['cask', 'mashBill', 'region'] as const;
		const r = parseReading(
			'{"cask": "Sherry cask", "mashBill": "", "region": "Islay, Scotland"}',
			fields
		);
		expect(r).toEqual({ cask: 'Sherry cask', mashBill: '', region: 'Islay, Scotland' });
	});
});
