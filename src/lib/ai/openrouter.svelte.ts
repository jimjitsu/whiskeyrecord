/**
 * AI label reading through the user's own OpenRouter account.
 *
 * Connecting uses OpenRouter's one-click sign-in (OAuth PKCE): no client
 * registration, no secret, no server. OpenRouter hands back a key that belongs
 * to the user; it's kept on this device only and sent nowhere but OpenRouter.
 */
const API = 'https://openrouter.ai/api/v1';
const KEY = 'whiskey-record:openrouter-key';
const MODEL_KEY = 'whiskey-record:openrouter-model';
const PKCE_KEY = 'whiskey-record:openrouter-pkce';

/** Preferred free models that read images well; first available wins. */
const PREFERRED = ['nvidia/nemotron-3.5-super-vl:free'];
/** OpenRouter's router that picks any free model able to handle the request. */
const FREE_ROUTER = 'openrouter/free';
export const AUTO = 'auto';

function read(key: string): string | null {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}
function write(key: string, value: string | null) {
	try {
		if (value == null) localStorage.removeItem(key);
		else localStorage.setItem(key, value);
	} catch {
		/* ignore */
	}
}

export const ai = $state({
	key: read(KEY),
	/** 'auto' or a model id the user picked in Settings. */
	model: read(MODEL_KEY) ?? AUTO
});

/** True when label reading can run right now. */
export function aiReady(): boolean {
	return !!ai.key && navigator.onLine;
}

// The connect flow may finish in another tab (Android opens OpenRouter outside
// the installed app), so pick up the key when another tab saves it.
if (typeof window !== 'undefined') {
	window.addEventListener('storage', (e) => {
		if (e.key === KEY) ai.key = e.newValue;
		if (e.key === MODEL_KEY) ai.model = e.newValue ?? AUTO;
	});
}

export function setModel(model: string) {
	ai.model = model;
	write(MODEL_KEY, model === AUTO ? null : model);
}

function base64url(bytes: ArrayBuffer | Uint8Array): string {
	const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
	let s = '';
	for (const b of arr) s += String.fromCharCode(b);
	return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Sends the user to OpenRouter to approve a key, then back to /ai/callback.
 * `returnTo` is where the callback lands afterwards.
 */
export async function connectOpenRouter(returnTo: string) {
	const verifier = base64url(crypto.getRandomValues(new Uint8Array(48)));
	const challenge = base64url(
		await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
	);
	const state = base64url(crypto.getRandomValues(new Uint8Array(16)));
	// localStorage, not sessionStorage: the callback may open in a different tab.
	write(PKCE_KEY, JSON.stringify({ verifier, state, returnTo, at: Date.now() }));
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- one-off URL, not UI state
	const params = new URLSearchParams({
		callback_url: `${location.origin}/ai/callback`,
		code_challenge: challenge,
		code_challenge_method: 'S256',
		state,
		key_label: 'Whiskey Record'
	});
	location.href = `https://openrouter.ai/auth?${params}`;
}

/** Finishes the connect flow on /ai/callback. Returns where to go next. */
export async function finishConnect(code: string, state: string | null): Promise<string> {
	const raw = read(PKCE_KEY);
	if (!raw) throw new Error('This sign-in link has expired. Start again from Settings.');
	const saved = JSON.parse(raw) as { verifier: string; state: string; returnTo: string };
	if (state && state !== saved.state) throw new Error('Sign-in didn’t match. Please try again.');
	const res = await fetch(`${API}/auth/keys`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ code, code_verifier: saved.verifier, code_challenge_method: 'S256' })
	});
	if (!res.ok) {
		throw new Error(
			res.status === 403
				? 'OpenRouter didn’t accept the sign-in (it may have expired). Please try again.'
				: `OpenRouter sign-in failed (${res.status}).`
		);
	}
	const { key } = (await res.json()) as { key?: string };
	if (!key) throw new Error('OpenRouter didn’t return a key.');
	write(KEY, key);
	write(PKCE_KEY, null);
	ai.key = key;
	return saved.returnTo || '/';
}

export function disconnectOpenRouter() {
	write(KEY, null);
	ai.key = null;
}

export interface VisionModel {
	id: string;
	name: string;
	free: boolean;
	structured: boolean;
}

let modelCache: Promise<VisionModel[]> | null = null;

/** Models that accept images, free ones first. Cached for this session. */
export function listVisionModels(): Promise<VisionModel[]> {
	modelCache ??= fetch(`${API}/models`)
		.then((r) => {
			if (!r.ok) throw new Error(`Couldn't load models (${r.status})`);
			return r.json();
		})
		.then((body: { data: ApiModel[] }) =>
			body.data
				.filter((m) => m.architecture?.input_modalities?.includes('image'))
				.filter((m) => m.architecture?.output_modalities?.includes('text') ?? true)
				.map((m) => ({
					id: m.id,
					name: m.name ?? m.id,
					free: m.id.endsWith(':free') || isZero(m.pricing),
					structured: !!m.supported_parameters?.includes('response_format')
				}))
				.sort((a, b) => Number(b.free) - Number(a.free) || a.name.localeCompare(b.name))
		)
		.catch((e) => {
			modelCache = null;
			throw e;
		});
	return modelCache;
}

interface ApiModel {
	id: string;
	name?: string;
	architecture?: { input_modalities?: string[]; output_modalities?: string[] };
	pricing?: { prompt?: string; completion?: string };
	supported_parameters?: string[];
}

function isZero(p?: ApiModel['pricing']) {
	return !!p && Number(p.prompt) === 0 && Number(p.completion) === 0;
}

/** The models to try, in order: the chosen one, then free fallbacks. */
async function modelsToTry(): Promise<{ models: string[]; structured: boolean }> {
	if (ai.model !== AUTO) return { models: [ai.model, FREE_ROUTER], structured: false };
	try {
		const free = (await listVisionModels()).filter((m) => m.free);
		const pick =
			PREFERRED.map((id) => free.find((m) => m.id === id)).find(Boolean) ??
			free.find((m) => m.structured) ??
			free[0];
		return pick
			? { models: [pick.id, FREE_ROUTER], structured: pick.structured }
			: { models: [FREE_ROUTER], structured: false };
	} catch {
		return { models: [FREE_ROUTER], structured: false };
	}
}

export interface LabelReading {
	name: string;
	distillery: string;
	type: string;
	age: string;
	proof: string;
	/** The model that answered, for the "read by" note. */
	model: string;
}

const FIELDS = ['name', 'distillery', 'type', 'age', 'proof'] as const;

const PROMPT = `You read whiskey bottle labels. Look at the photo(s) and reply with ONLY a JSON object, no other text:
{"name": "", "distillery": "", "type": "", "age": "", "proof": ""}
Rules:
- name: the product name as a person would say it, e.g. "Eagle Rare 10 Year", "Lagavulin 16". Leave out words like "Kentucky Straight Bourbon Whiskey" unless they are the name.
- distillery: who made it, e.g. "Buffalo Trace". Use the producer, not the parent company, if both appear.
- type: a short style, e.g. "Bourbon", "Rye", "Scotch", "Irish", "Japanese", "Tennessee".
- age: like "10 yr". Blank if no age statement.
- proof: a number only, e.g. "90". If only ABV is shown, proof = ABV x 2 (45% -> "90").
- If something isn't readable, use "". Never guess a value that isn't on the label.
- If the photo isn't a whiskey bottle, return all fields as "".`;

const SCHEMA = {
	type: 'object',
	properties: Object.fromEntries(FIELDS.map((f) => [f, { type: 'string' }])),
	required: [...FIELDS],
	additionalProperties: false
};

export class AiError extends Error {
	constructor(
		message: string,
		public kind: 'auth' | 'limit' | 'credits' | 'busy' | 'network' | 'parse' | 'other'
	) {
		super(message);
	}
}

async function toDataUrl(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const r = new FileReader();
		r.onload = () => resolve(r.result as string);
		r.onerror = () => reject(r.error);
		r.readAsDataURL(blob);
	});
}

/** Pulls the first JSON object out of a reply, tolerating code fences or chatter. */
export function parseReading(text: string): Omit<LabelReading, 'model'> {
	const match = text.match(/\{[\s\S]*\}/);
	if (!match) throw new AiError("The AI's answer couldn't be read.", 'parse');
	let obj: Record<string, unknown>;
	try {
		obj = JSON.parse(match[0]);
	} catch {
		throw new AiError("The AI's answer couldn't be read.", 'parse');
	}
	const clean = (v: unknown) =>
		typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '';
	const out = Object.fromEntries(FIELDS.map((f) => [f, clean(obj[f])])) as Omit<
		LabelReading,
		'model'
	>;
	out.proof = out.proof.replace(/\s*proof$/i, '');
	return out;
}

/** Reads up to two photos (cover first) and returns what's on the label. */
export async function readLabel(photos: Blob[], signal?: AbortSignal): Promise<LabelReading> {
	if (!ai.key) throw new AiError('Connect OpenRouter in Settings to read labels.', 'auth');
	const { models, structured } = await modelsToTry();
	const images = await Promise.all(photos.slice(0, 2).map(toDataUrl));
	const body: Record<string, unknown> = {
		models,
		messages: [
			{
				role: 'user',
				content: [
					{ type: 'text', text: PROMPT },
					...images.map((url) => ({ type: 'image_url', image_url: { url } }))
				]
			}
		],
		temperature: 0,
		max_tokens: 300
	};
	if (structured) {
		body.response_format = {
			type: 'json_schema',
			json_schema: { name: 'whiskey_label', strict: true, schema: SCHEMA }
		};
	}

	let res: Response;
	try {
		res = await fetch(`${API}/chat/completions`, {
			method: 'POST',
			signal,
			headers: {
				Authorization: `Bearer ${ai.key}`,
				'Content-Type': 'application/json',
				'HTTP-Referer': location.origin,
				'X-Title': 'Whiskey Record'
			},
			body: JSON.stringify(body)
		});
	} catch (e) {
		if ((e as Error).name === 'AbortError') throw e;
		throw new AiError("Couldn't reach OpenRouter. Check your connection.", 'network');
	}

	if (!res.ok) {
		let detail = '';
		try {
			detail = (await res.json()).error?.message ?? '';
		} catch {
			/* not JSON */
		}
		if (res.status === 401) {
			disconnectOpenRouter();
			throw new AiError('Your OpenRouter connection has ended. Reconnect it in Settings.', 'auth');
		}
		if (res.status === 402)
			throw new AiError(
				'Your OpenRouter account needs credit before it can read labels.',
				'credits'
			);
		if (res.status === 429)
			throw new AiError(
				/per.?day|daily/i.test(detail)
					? 'You’ve used today’s free label reads. Fill it in yourself, or try again tomorrow.'
					: 'The free AI is busy right now. Try again in a minute, or fill it in yourself.',
				'limit'
			);
		if (res.status >= 500 || res.status === 408)
			throw new AiError(
				'The AI is having trouble right now. Try again, or fill it in yourself.',
				'busy'
			);
		throw new AiError(detail || `Label reading failed (${res.status}).`, 'other');
	}

	const data = (await res.json()) as {
		model?: string;
		choices?: { message?: { content?: string | { type: string; text?: string }[] } }[];
	};
	const content = data.choices?.[0]?.message?.content;
	const text = Array.isArray(content) ? content.map((c) => c.text ?? '').join('') : (content ?? '');
	return { ...parseReading(text), model: data.model ?? models[0] };
}
