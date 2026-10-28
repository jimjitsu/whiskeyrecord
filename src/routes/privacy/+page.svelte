<script lang="ts">
	import { PUBLIC_FEEDBACK_EMAIL } from '$app/env/public';
	import AppHeader from '#lib/components/AppHeader.svelte';
</script>

<svelte:head><title>Privacy · Whiskey Record</title></svelte:head>

<AppHeader>
	{#snippet left()}<a class="btn" href="/">‹ Home</a>{/snippet}
</AppHeader>

<main>
	<h1>Privacy</h1>
	<p class="lead">
		Whiskey Record has no server of its own. Your record lives on your phone and in your own Google
		Drive. Nobody else, including the app's maker, can see it.
	</p>

	<section>
		<h2 class="eyebrow">What's stored where</h2>
		<ul>
			<li>
				<strong>On your phone:</strong> a copy of your record and photos, so search and adding work offline.
			</li>
			<li>
				<strong>In your Google Drive:</strong> a “Whiskey Record” sheet and a “Whiskey Record Photos”
				folder that the app creates. They belong to you.
			</li>
			<li>
				<strong>Optional AI label reading:</strong> if you connect OpenRouter, the photos you ask it to
				read are sent to OpenRouter and the AI model you picked, under your own OpenRouter account. Your
				OpenRouter key stays on your phone.
			</li>
		</ul>
	</section>

	<section>
		<h2 class="eyebrow">Google access</h2>
		<p>
			The app asks only for the <code>drive.file</code> permission: it can see and change only the files
			it created (the sheet and photo folder), nothing else in your Drive. Sign-in happens in your browser
			with Google; the app never sees your password.
		</p>
	</section>

	<section>
		<h2 class="eyebrow">What isn't collected</h2>
		<p>
			No analytics, no ads, no tracking cookies, no accounts. The app's files are served by
			Cloudflare, which, like any web host, handles standard request details such as your IP address
			to deliver the pages.
		</p>
	</section>

	<section>
		<h2 class="eyebrow">Removing your data</h2>
		<p>
			Disconnect Google and OpenRouter in Settings, delete the sheet and photo folder from your
			Drive if you want them gone, and clear this site's data in your browser (or uninstall the app)
			to remove the copy on your phone. You can also revoke the app's access in your Google Account
			under Security → Third-party connections.
		</p>
	</section>

	{#if PUBLIC_FEEDBACK_EMAIL}
		<p class="muted small">
			Questions: <a href="mailto:{PUBLIC_FEEDBACK_EMAIL}">{PUBLIC_FEEDBACK_EMAIL}</a>
		</p>
	{/if}
	<p class="muted small">Last updated 28 October 2026.</p>
</main>

<style>
	main {
		display: grid;
		gap: var(--space-5);
		padding: var(--space-2) var(--gutter) var(--space-6);
	}
	section {
		display: grid;
		gap: var(--space-2);
	}
	h2 {
		margin: 0;
	}
	p,
	ul {
		margin: 0;
	}
	ul {
		display: grid;
		gap: var(--space-2);
		padding-left: 1.2em;
	}
	.lead {
		font-size: 17px;
	}
	.small {
		font-size: 13px;
	}
</style>
