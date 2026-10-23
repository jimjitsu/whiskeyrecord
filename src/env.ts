import { defineEnvVars } from '@sveltejs/kit/env';

// Both values are meant to be visible in the browser; they're restricted to
// this app's sites in the Google Cloud console. Set them in .env (see .env.example).
export const variables = defineEnvVars({
	PUBLIC_GOOGLE_CLIENT_ID: {
		public: true,
		static: true,
		description: 'Google OAuth client ID (Web application)'
	},
	PUBLIC_GOOGLE_API_KEY: {
		public: true,
		static: true,
		description: 'Google API key, restricted to the Picker API and this app’s origins',
		schema: (v) => v ?? ''
	}
});
