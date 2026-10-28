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
	/** Rough cost in US dollars to read one bottle (both steps), from live pricing. */
	perBottle: number;
}

/**
 * Paid models worth offering, in order. Picked for reading label text into
 * JSON accurately at a low price (Oct 2026); the full list stays one tap away.
 */
export const PAID_SHORTLIST: { id: string; note: string; recommended?: boolean }[] = [
	{
		id: 'anthropic/claude-haiku-5.5',
		note: 'most accurate for the price',
		recommended: true
	},
	{ id: 'openai/gpt-6-luna', note: 'close second, a little faster' },
	{ id: 'nvidia/nemotron-3.5-super-vl', note: 'the free default, without the daily limit' },
	{ id: 'anthropic/claude-sonnet-5.5', note: 'for hard-to-read labels' }
];

// One bottle = two requests (label, then bottle details), each sending up to
// two ~1200px photos (~1,500 tokens each) plus the prompt, and getting a short
// JSON answer plus a little reasoning back.
const TOKENS_IN_PER_BOTTLE = 6_500;
const TOKENS_OUT_PER_BOTTLE = 800;

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
					structured: !!m.supported_parameters?.includes('response_format'),
					perBottle:
						TOKENS_IN_PER_BOTTLE * Number(m.pricing?.prompt ?? 0) +
						TOKENS_OUT_PER_BOTTLE * Number(m.pricing?.completion ?? 0)
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

/**
 * Label reading runs in two steps so the form fills quickly: the core fields
 * first (what the duplicate check and search need), then the bottle details
 * in a second, background request. One request asking for everything made
 * free "thinking" models slow enough to time out.
 */
const CORE = ['name', 'distillery', 'type', 'age', 'proof'] as const;
const DETAILS = ['cask', 'mashBill', 'batch', 'bottleSize', 'released', 'region'] as const;
type CoreField = (typeof CORE)[number];
type DetailField = (typeof DETAILS)[number];

/** The model that answered is kept for the "read by" note. */
export type LabelReading = Record<CoreField, string> & { model: string };
export type DetailReading = Record<DetailField, string> & { model: string };

const COMMON_RULES = `- If something isn't readable, use "". Never guess a value that isn't on the label.
- If the photo isn't a whiskey bottle, return all fields as "".`;

const CORE_PROMPT = `You read whiskey bottle labels. Look at the photo(s) and reply with ONLY a JSON object, no other text:
{"name": "", "distillery": "", "type": "", "age": "", "proof": ""}
Rules:
- name: the product name as a person would say it, e.g. "Eagle Rare 10 Year", "Lagavulin 16". Leave out words like "Kentucky Straight Bourbon Whiskey" unless they are the name.
- distillery: who made it, e.g. "Buffalo Trace". Use the producer, not the parent company, if both appear.
- type: a short style, e.g. "Bourbon", "Rye", "Scotch", "Irish", "Japanese", "Tennessee".
- age: like "10 yr". Blank if no age statement.
- proof: a number only, e.g. "90". If only ABV is shown, proof = ABV x 2 (45% -> "90").
${COMMON_RULES}`;

const DETAIL_PROMPT = `You read whiskey bottle labels. Copy these details only if they are printed on the label. Reply with ONLY a JSON object, no other text:
{"cask": "", "mashBill": "", "batch": "", "bottleSize": "", "released": "", "region": ""}
Rules:
- cask: the cask type or finish, e.g. "Port cask finish", "Sherry cask", "New charred oak".
- mashBill: the grain recipe, e.g. "75% corn, 13% rye, 12% malted barley".
- batch: a batch, barrel or cask number, e.g. "Batch 23B", "Barrel 4512".
- bottleSize: the volume, e.g. "750 ml", "70 cl", "1 L".
- released: a release, bottling or vintage year, e.g. "2024".
- region: where it's from as printed, e.g. "Kentucky, USA", "Islay, Scotland".
- Most labels show only a few of these: leave the rest "". Don't think hard about it.
${COMMON_RULES}`;

interface Task<F extends string> {
	fields: readonly F[];
	prompt: string;
	schemaName: string;
}
const CORE_TASK: Task<CoreField> = {
	fields: CORE,
	prompt: CORE_PROMPT,
	schemaName: 'whiskey_label'
};
const DETAIL_TASK: Task<DetailField> = {
	fields: DETAILS,
	prompt: DETAIL_PROMPT,
	schemaName: 'whiskey_label_details'
};

const schemaFor = (fields: readonly string[]) => ({
	type: 'object',
	properties: Object.fromEntries(fields.map((f) => [f, { type: 'string' }])),
	required: [...fields],
	additionalProperties: false
});

export class AiError extends Error {
	constructor(
		message: string,
		public kind: 'auth' | 'limit' | 'credits' | 'busy' | 'network' | 'parse' | 'other',
		/** What came back, for the "Details" line under the error. */
		public details = ''
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

/**
 * Pulls the label fields out of a reply. Tolerates code fences, chatter around
 * the JSON, single quotes and trailing commas, and as a last resort picks the
 * fields out one by one. Returns null if nothing usable is there.
 */
export function parseReading<F extends string = CoreField>(
	text: string,
	fields: readonly F[] = CORE as unknown as readonly F[]
): Record<F, string> | null {
	const clean = (v: unknown) =>
		typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '';
	const finish = (obj: Record<string, unknown>): Record<F, string> | null => {
		const out = Object.fromEntries(fields.map((f) => [f, clean(obj[f])])) as Record<F, string>;
		if ('proof' in out)
			(out as Record<string, string>).proof = out['proof' as F].replace(/\s*proof$/i, '');
		return fields.some((f) => f in obj) ? out : null;
	};

	const match = text.match(/\{[\s\S]*\}/);
	if (match) {
		const candidates = [
			match[0],
			match[0].replace(/,\s*([}\]])/g, '$1'),
			match[0].replace(/,\s*([}\]])/g, '$1').replace(/'/g, '"')
		];
		for (const c of candidates) {
			try {
				const parsed = finish(JSON.parse(c));
				if (parsed) return parsed;
			} catch {
				/* try the next repair */
			}
		}
	}
	// Field by field: "name": "…" or name: …
	const obj: Record<string, string> = {};
	for (const f of fields) {
		const m = text.match(new RegExp(`["']?${f}["']?\\s*[:=]\\s*["']?([^"'\\n,}]*)`, 'i'));
		if (m) obj[f] = m[1];
	}
	return Object.keys(obj).length ? finish(obj) : null;
}

const ERRORS = {
	auth: 'Your OpenRouter connection has ended. Reconnect it in Settings.',
	credits: 'Your OpenRouter account needs credit before it can read labels.',
	daily: 'You’ve used today’s free label reads. Fill it in yourself, or try again tomorrow.',
	busy: 'The free AI is busy right now. Try again in a minute, or fill it in yourself.',
	trouble: 'The AI is having trouble right now. Try again, or fill it in yourself.',
	unreadable: "The AI's answer couldn't be read. Try again, or fill it in yourself."
};

/** One request to OpenRouter. Returns the parsed reading or throws an AiError. */
async function ask<F extends string>(
	task: Task<F>,
	models: string[],
	structured: boolean,
	images: string[],
	signal?: AbortSignal
): Promise<Record<F, string> & { model: string }> {
	const body: Record<string, unknown> = {
		models,
		messages: [
			{
				role: 'user',
				content: [
					{ type: 'text', text: task.prompt },
					...images.map((url) => ({ type: 'image_url', image_url: { url } }))
				]
			}
		],
		temperature: 0,
		// Room for "thinking" models: their reasoning counts against this limit.
		max_tokens: 2000,
		// Reading a label needs little thought; keep it quick and don't send it back.
		reasoning: { effort: 'low', exclude: true }
	};
	if (structured) {
		body.response_format = {
			type: 'json_schema',
			json_schema: { name: task.schemaName, strict: true, schema: schemaFor(task.fields) }
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
		const info = `HTTP ${res.status}${detail ? `: ${detail}` : ''}`;
		if (res.status === 401) {
			disconnectOpenRouter();
			throw new AiError(ERRORS.auth, 'auth', info);
		}
		if (res.status === 402) throw new AiError(ERRORS.credits, 'credits', info);
		if (res.status === 429)
			throw new AiError(/per.?day|daily/i.test(detail) ? ERRORS.daily : ERRORS.busy, 'limit', info);
		if (res.status >= 500 || res.status === 408) throw new AiError(ERRORS.trouble, 'busy', info);
		throw new AiError(detail || `Label reading failed (${res.status}).`, 'other', info);
	}

	const data = (await res.json()) as {
		model?: string;
		error?: { message?: string };
		choices?: {
			finish_reason?: string;
			message?: { content?: string | { type: string; text?: string }[] | null; reasoning?: string };
		}[];
	};
	const choice = data.choices?.[0];
	const content = choice?.message?.content;
	const text = Array.isArray(content) ? content.map((c) => c.text ?? '').join('') : (content ?? '');
	const model = data.model ?? models[0];
	// Some models put the answer in their reasoning instead of the reply.
	const parsed =
		parseReading(text, task.fields) ?? parseReading(choice?.message?.reasoning ?? '', task.fields);
	if (parsed) return { ...parsed, model };

	const snippet = text.trim().slice(0, 200) || '(empty reply)';
	throw new AiError(
		ERRORS.unreadable,
		'parse',
		`${model} · finish: ${choice?.finish_reason ?? data.error?.message ?? 'unknown'} · ${snippet}`
	);
}

async function run<F extends string>(
	task: Task<F>,
	photos: Blob[],
	signal?: AbortSignal
): Promise<Record<F, string> & { model: string }> {
	if (!ai.key) throw new AiError('Connect OpenRouter in Settings to read labels.', 'auth');
	const { models, structured } = await modelsToTry();
	const images = await Promise.all(photos.slice(0, 2).map(toDataUrl));
	try {
		return await ask(task, models, structured, images, signal);
	} catch (e) {
		// An unreadable answer: try once more with a different free model and plain JSON.
		if (!(e instanceof AiError) || e.kind !== 'parse' || models[0] === FREE_ROUTER) throw e;
		try {
			return await ask(task, [FREE_ROUTER], false, images, signal);
		} catch (retry) {
			if (retry instanceof AiError && retry.kind === 'parse')
				retry.details = `${e.details}\nRetry: ${retry.details}`;
			throw retry;
		}
	}
}

/** Reads up to two photos (cover first): name, distillery, type, age, proof. */
export function readLabel(photos: Blob[], signal?: AbortSignal): Promise<LabelReading> {
	return run(CORE_TASK, photos, signal);
}

/** Second step: bottle details (cask, mash bill, batch, size, year, region) if printed. */
export function readDetails(photos: Blob[], signal?: AbortSignal): Promise<DetailReading> {
	return run(DETAIL_TASK, photos, signal);
}

/** "about 0.1¢ a bottle (10¢ per 100)" */
export function costLabel(perBottle: number): string {
	if (!(perBottle > 0)) return 'free';
	const cents = perBottle * 100;
	const each =
		cents < 0.1 ? 'under 0.1¢' : cents < 10 ? `${cents.toFixed(1)}¢` : `${Math.round(cents)}¢`;
	const hundred = perBottle * 100;
	const per100 = hundred < 1 ? `${Math.round(hundred * 100)}¢` : `$${hundred.toFixed(2)}`;
	return `about ${each} a bottle (${per100} per 100)`;
}
