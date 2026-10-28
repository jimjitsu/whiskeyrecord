// Browser bits the app modules expect, for unit tests running in Node.
import 'fake-indexeddb/auto';

const store = new Map<string, string>();
globalThis.localStorage ??= {
	getItem: (k: string) => store.get(k) ?? null,
	setItem: (k: string, v: string) => void store.set(k, String(v)),
	removeItem: (k: string) => void store.delete(k),
	clear: () => store.clear(),
	key: (i: number) => [...store.keys()][i] ?? null,
	get length() {
		return store.size;
	}
} as Storage;
