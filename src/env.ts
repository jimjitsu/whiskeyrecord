import { defineEnvVars } from '@sveltejs/kit/env';

// Meant to be visible in the browser; it's restricted to this app's sites in
// the Google Cloud console. Set it in .env (see .env.example).
export const variables = defineEnvVars({
	PUBLIC_GOOGLE_CLIENT_ID: {
		public: true,
		static: true,
		description: 'Google OAuth client ID (Web application)'
	}
});
