/// <reference types="vitest/config" />
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// Single-page app: every route falls back to index.html, served as plain files.
			adapter: adapter({ fallback: 'index.html' }),
			// Absolute asset paths, so the fallback page works at any route depth.
			paths: { relative: false },
			// Check for a new deploy every 5 minutes (and on focus); the layout
			// then switches to a full page load so the new version is used.
			version: { pollInterval: 5 * 60_000 }
		})
	],
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'node',
		setupFiles: ['src/test-setup.ts']
	}
});
