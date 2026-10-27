/**
 * In-memory navigation state: where a record's back button goes (home with the
 * search still typed in, or My whiskeys with its filter and sort).
 */
export const nav = $state({ back: '/', query: '', show: 'all', sort: 'newest' });
