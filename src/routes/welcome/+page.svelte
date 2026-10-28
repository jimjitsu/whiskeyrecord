<script lang="ts">
	import { goto } from '$app/navigation';
	import { signIn } from '#lib/google/auth.svelte.ts';
	import { connectSheet, sync, syncNow } from '#lib/sync.svelte.ts';
	import { markOnboarded } from '#lib/onboarding.ts';
	import { connectOpenRouter } from '#lib/ai/openrouter.svelte.ts';

	function connectAi() {
		// Onboarding is done either way; OpenRouter returns the user to home.
		markOnboarded();
		connectOpenRouter('/');
	}

	// Two steps, one job each: connect Google (the sheet is found or created
	// automatically), then optionally set up AI label reading.
	let step = $state<1 | 2>(1);
	let busy = $state(false);
	let error = $state('');
	let result = $state<'found' | 'created'>('created');

	async function connect() {
		error = '';
		busy = true;
		try {
			const token = await signIn('consent');
			result = await connectSheet(token);
			syncNow();
			step = 2;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Something went wrong.';
		} finally {
			busy = false;
		}
	}

	function finish() {
		markOnboarded();
		goto('/', { replaceState: true });
	}
</script>

<main>
	<img class="logo" src="/icon.svg" alt="" width="56" height="56" />

	{#if step === 1}
		<h1>Keep a record of every whiskey.</h1>
		<p class="muted">
			Snap a bottle, rate it, and find it again later. Your record lives in a Google Sheet that you
			own. Nothing is stored on our servers.
		</p>
		<ol class="steps">
			<li><span>1</span>Connect Google Drive</li>
			<li><span>2</span>Add AI label reading (optional)</li>
		</ol>

		<div class="actions">
			<button class="btn btn-primary btn-block" type="button" onclick={connect} disabled={busy}>
				{busy ? 'Connecting…' : 'Connect Google Drive'}
			</button>
			{#if error}<p class="error" role="alert">{error}</p>{/if}
			<p class="small muted">
				Already use Whiskey Record on another device? Connecting finds your existing sheet
				automatically. The app can only see files it created.
			</p>
			<button class="link" type="button" onclick={finish}>Not now, keep it on this device</button>
		</div>
		<p class="eyebrow step">Step 1 of 2</p>
		<a class="privacy" href="/privacy">How your data is kept private</a>
	{:else}
		<p class="done">
			<span aria-hidden="true">✓</span>
			{#if result === 'found'}Found your sheet. Your record will sync to this device.{:else}Sheet
				created: “Whiskey Record” in your Drive.{/if}
			{#if sync.config}<a href={sync.config.sheetUrl} target="_blank" rel="noopener">Open it</a
				>{/if}
		</p>
		<h1>Want AI to read labels?</h1>
		<p class="muted">
			Connect a free OpenRouter account and Whiskey Record fills in the name, distillery, age and
			proof from your photo. You can always type it yourself.
		</p>
		<ul class="small">
			<li>Free models: about 50 label reads a day</li>
			<li>Your key stays on this phone</li>
		</ul>
		<div class="actions">
			<button class="btn btn-primary btn-block" type="button" onclick={connectAi}>
				Connect OpenRouter
			</button>
			<button class="btn btn-block" type="button" onclick={finish}>Skip for now</button>
		</div>
		<p class="eyebrow step">Step 2 of 2</p>
	{/if}
</main>

<style>
	main {
		display: grid;
		gap: var(--space-4);
		align-content: start;
		min-height: 100dvh;
		padding: var(--space-5) var(--gutter) var(--space-6);
	}
	.logo {
		border: var(--border);
	}
	p {
		margin: 0;
	}
	.steps {
		list-style: none;
		margin: 0;
		padding: var(--space-4);
		display: grid;
		gap: var(--space-3);
		background: var(--surface);
		border: var(--border);
	}
	.steps li {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}
	.steps span {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		background: var(--ink);
		color: var(--base);
		font-weight: 700;
		font-size: 14px;
	}
	.actions {
		display: grid;
		gap: var(--space-3);
		margin-top: var(--space-4);
	}
	.small {
		font-size: 14px;
	}
	ul.small {
		margin: 0;
		padding-left: 1.2em;
	}
	.link {
		justify-self: start;
		min-height: var(--tap);
		padding: 0;
		border: 0;
		background: none;
		text-decoration: underline;
		cursor: pointer;
		font-size: 14px;
	}
	.error {
		padding: var(--space-2) var(--space-3);
		border-left: 4px solid var(--red);
		background: var(--surface);
		font-size: 14px;
	}
	.done {
		padding: var(--space-3);
		border: var(--border);
		border-left: 4px solid var(--teal);
		background: var(--surface);
		font-size: 14px;
	}
	.privacy {
		font-size: 13px;
		color: var(--ink-muted);
	}
	.step {
		margin-top: var(--space-4);
	}
</style>
