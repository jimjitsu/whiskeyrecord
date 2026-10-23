# Whiskey Record

A small installable web app (PWA) for keeping track of whiskeys you've tried or want to try. Snap a bottle, rate it, and find it again later. Your record lives in a Google Sheet you own; nothing is stored on a server.

## Status

Working now, on-device only:

- Search home screen with typo-tolerant matching
- In-app camera with gallery picker and multiple photos (first is the cover)
- New / edit form with draft autosave, duplicate check, status, 1–5 rating with 0.1 slider
- Read-only record view; status and rating save instantly; Saved · Undo
- Offline support (service worker) and installable manifest
- Export CSV

Next: Google sign-in and Sheet sync, then OpenRouter label reading.

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
