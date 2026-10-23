# Whiskey Record

A small installable web app (PWA) for keeping track of whiskeys you've tried or want to try. Snap a bottle, rate it, and find it again later. Your record lives in a Google Sheet you own; nothing is stored on a server.

## Status

Working now:

- Google sign-in (browser only, `drive.file` permission) and two-way sync with a Google Sheet the app creates; photos go to a "Whiskey Record Photos" folder in Drive
- A second device finds the existing sheet automatically
- Edits made directly in the sheet sync back, including rows typed in by hand

- Search home screen with typo-tolerant matching
- In-app camera with gallery picker and multiple photos (first is the cover)
- New / edit form with draft autosave, duplicate check, status, 1–5 rating with 0.1 slider
- Read-only record view; status and rating save instantly; Saved · Undo
- Offline support (service worker) and installable manifest
- Export CSV

Next: OpenRouter label reading.

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
