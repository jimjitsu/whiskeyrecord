# Whiskey Record

A small installable web app (PWA) for keeping track of whiskeys you've tried or want to try. Snap a bottle, rate it, and find it again later. Your record lives in a Google Sheet you own; nothing is stored on a server.

## Status

Working now:

- Google sign-in (browser only, `drive.file` permission) and two-way sync with a Google Sheet the app creates; photos go to a "Whiskey Record Photos" folder in Drive
- A second device finds the existing sheet automatically
- Edits made directly in the sheet sync back, including rows typed in by hand

- Home with two paths: typo-tolerant search ("Have I had this?") or add a whiskey; the full list lives on a My whiskeys screen with filters and sorting
- In-app camera with gallery picker and multiple photos (first is the cover)
- New / edit form with draft autosave, duplicate check, status, 1–5 rating with 0.1 slider, and optional detail groups (when & where, bottle details, buying & owning, tags)
- Read-only record view with a portrait thumbnail and full-screen photo viewer; status, rating and bottle level save instantly; Saved · Undo
- Bottle level for bottles you own, a Shelf filter, and a shopping list of running-low bottles you'd buy again plus your want-to-try list
- Offline support (service worker) and installable manifest
- Export CSV
- Share to Whiskey Record from Android's share sheet (installed app): shared photos open a new record and are read by AI; a shared link starts a record named from the page title

- AI label reading with the user's own OpenRouter account (one-click PKCE connect, key kept on the device). Defaults to the best free model that reads images, falling back to `openrouter/free`; any vision model can be picked in Settings. Photos from the camera are read automatically; AI-filled fields are marked, and disagreements with what's already there show a pick-one card.

### How sync works

The sheet is the source of truth; the device keeps a copy for search and offline use. Rows are matched by the ID column. Changed on one side only → that side wins; changed on both → the newer Updated time wins. Google access tokens last about an hour and there's no refresh token without a server, so after that the sync chip asks for a tap to renew.

## Stack

SvelteKit 3 (Svelte 5) as a static single-page app, Dexie (IndexedDB) for the on-device copy, Fuse.js for search. Design tokens and fonts from the jimjitsu.dev design system.

## Develop

```sh
cp .env.example .env   # fill in the Google client ID and API key
npm install
npm run dev            # http://localhost:5173
npm run check          # types
npm run build          # static site in ./build
```

The camera needs HTTPS or localhost. To try it on an Android phone during development, use Chrome's remote debugging port forwarding, or deploy a preview.

## Deploy

Hosted on Cloudflare (Workers static assets), configured in `wrangler.jsonc`. With the GitHub repo connected in Cloudflare, every push to `main` builds and deploys. Build settings:

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Build variables: `PUBLIC_GOOGLE_CLIENT_ID`, `PUBLIC_GOOGLE_API_KEY` (same values as `.env`)

Manual deploy from a computer: `npx wrangler login`, then `npm run deploy`.
