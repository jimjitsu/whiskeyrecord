/**
 * Light / dark theme. "System" follows the phone's setting (the default);
 * Light or Dark overrides it on this device. app.html applies the saved choice
 * before the page draws, so there's no flash of the wrong theme.
 */
export type ThemeChoice = 'system' | 'light' | 'dark';

const KEY = 'whiskey-record:theme';
const COLORS = { light: '#f5efe0', dark: '#15110d' };

function saved(): ThemeChoice {
	try {
		const v = localStorage.getItem(KEY);
		return v === 'light' || v === 'dark' ? v : 'system';
	} catch {
		return 'system';
	}
}

export const theme = $state<{ choice: ThemeChoice }>({
	choice: typeof localStorage === 'undefined' ? 'system' : saved()
});

/** Sets the page to the choice: a data-theme attribute and the browser bar color. */
export function applyTheme(choice: ThemeChoice) {
	const root = document.documentElement;
	if (choice === 'system') root.removeAttribute('data-theme');
	else root.dataset.theme = choice;
	// Two theme-color tags, one per system scheme; a forced theme sets both.
	document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
		const scheme = m.media.includes('dark') ? 'dark' : 'light';
		m.content = COLORS[choice === 'system' ? scheme : choice];
	});
}

export function setTheme(choice: ThemeChoice) {
	theme.choice = choice;
	try {
		if (choice === 'system') localStorage.removeItem(KEY);
		else localStorage.setItem(KEY, choice);
	} catch {
		/* storage unavailable: applies for this visit only */
	}
	applyTheme(choice);
}
