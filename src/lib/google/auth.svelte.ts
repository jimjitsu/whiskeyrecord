import { PUBLIC_GOOGLE_CLIENT_ID } from '$app/env/public';

/**
 * Google sign-in with Google Identity Services' token flow. Everything runs in
 * the browser: no server, no client secret. Access tokens last about an hour;
 * there's no refresh token without a server, so when one expires the user taps
 * "Sync" to get a new one (usually a popup that closes itself).
 */
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const TOKEN_KEY = 'whiskey-record:google-token';

interface StoredToken {
	accessToken: string;
	expiresAt: number;
}

interface TokenResponse {
	access_token?: string;
	expires_in?: number;
	error?: string;
	error_description?: string;
}

interface TokenClient {
	callback: (r: TokenResponse) => void;
	error_callback?: (e: { type: string; message?: string }) => void;
	requestAccessToken: (opts?: { prompt?: string }) => void;
}

interface GoogleOAuth2 {
	initTokenClient: (cfg: {
		client_id: string;
		scope: string;
		callback: (r: TokenResponse) => void;
		error_callback?: (e: { type: string; message?: string }) => void;
	}) => TokenClient;
	revoke: (token: string, done?: () => void) => void;
}

declare global {
	interface Window {
		google?: { accounts?: { oauth2?: GoogleOAuth2 } };
	}
}

function readToken(): StoredToken | null {
	try {
		const raw = localStorage.getItem(TOKEN_KEY);
		return raw ? (JSON.parse(raw) as StoredToken) : null;
	} catch {
		return null;
	}
}

export const auth = $state<{ token: StoredToken | null }>({ token: readToken() });

/** A token that's good for at least another minute, or null. */
export function getToken(): string | null {
	const t = auth.token;
	return t && t.expiresAt - Date.now() > 60_000 ? t.accessToken : null;
}

let gisPromise: Promise<GoogleOAuth2> | null = null;

/** Loads Google's sign-in library. Call early (on page load) so sign-in can open from a tap. */
export function loadGis(): Promise<GoogleOAuth2> {
	if (window.google?.accounts?.oauth2) return Promise.resolve(window.google.accounts.oauth2);
	gisPromise ??= new Promise((resolve, reject) => {
		const s = document.createElement('script');
		s.src = 'https://accounts.google.com/gsi/client';
		s.async = true;
		s.onload = () =>
			window.google?.accounts?.oauth2
				? resolve(window.google.accounts.oauth2)
				: reject(new Error('Google sign-in did not load'));
		s.onerror = () => {
			gisPromise = null;
			reject(new Error("Couldn't reach Google. Check your connection."));
		};
		document.head.appendChild(s);
	});
	return gisPromise;
}

let client: TokenClient | null = null;

/**
 * Opens Google's sign-in. Must be called straight from a tap, or the browser
 * blocks the popup. `consent` shows the full permission screen (first connect);
 * an empty prompt reuses the earlier approval.
 */
export function signIn(prompt: 'consent' | '' = ''): Promise<string> {
	const oauth2 = window.google?.accounts?.oauth2;
	if (!oauth2) {
		return loadGis().then(() => {
			throw new Error('Google sign-in was still loading. Tap again.');
		});
	}
	return new Promise((resolve, reject) => {
		client ??= oauth2.initTokenClient({
			client_id: PUBLIC_GOOGLE_CLIENT_ID,
			scope: SCOPE,
			callback: () => {}
		});
		client.callback = (r) => {
			if (r.error || !r.access_token) {
				reject(new Error(r.error_description || r.error || 'Google sign-in failed'));
				return;
			}
			const token = {
				accessToken: r.access_token,
				expiresAt: Date.now() + (r.expires_in ?? 3600) * 1000
			};
			auth.token = token;
			try {
				localStorage.setItem(TOKEN_KEY, JSON.stringify(token));
			} catch {
				/* ignore */
			}
			resolve(token.accessToken);
		};
		client.error_callback = (e) =>
			reject(
				new Error(
					e.type === 'popup_closed'
						? 'Sign-in was closed before it finished.'
						: e.type === 'popup_failed_to_open'
							? 'The browser blocked the Google sign-in popup.'
							: e.message || 'Google sign-in failed'
				)
			);
		client.requestAccessToken({ prompt });
	});
}

export function clearToken() {
	auth.token = null;
	try {
		localStorage.removeItem(TOKEN_KEY);
	} catch {
		/* ignore */
	}
}

/** Disconnects: revokes Google's permission for this app and forgets the token. */
export async function signOut() {
	const t = auth.token?.accessToken;
	clearToken();
	if (t) {
		const oauth2 = await loadGis().catch(() => null);
		oauth2?.revoke(t);
	}
}
