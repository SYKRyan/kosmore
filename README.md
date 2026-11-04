# KosMore

A Chrome Manifest V3 companion for [Kosmora](https://kosmora.io). Hover a card for market history and pinned album shortcuts, including while revealing a pack and reviewing its summary.

## Install the built extension

1. Open `chrome://extensions` in Chrome and enable **Developer mode**.
2. Choose **Load unpacked**, then select this repository's **`dist`** directory.
3. Reload any already-open Kosmora tabs so Chrome injects the content script.
4. Click the KosMore toolbar icon. Keep a signed-in Kosmora tab open, choose an account if prompted, pin your albums, and **Save settings**.
5. Hover a card. Move into the popup to use its controls; Escape dismisses it.

The built `dist` directory is included. Loading the extension and changing its local preferences do not add, remove, buy, sell, give, or open anything in the game. Clicking a pinned album button explicitly submits an add request. Existing memberships are disabled, and KosMore never submits an album deletion.

## Features

- Card detection in collections, albums, market tiles, card pages, native card previews, pack reveals, and recap grids. Other displays using the same card markup are supported by the shared detector.
- Interested-player counts and **Kosmora's recorded median daily Wikipedia views**, displayed separately from market activity. No direct Wikimedia requests.
- A 30-day completed-sales chart, server-provided count/minimum/median/maximum for each of Standard, Shiny, and Full art, and up to ten returned recent sales. Missing and failed groups remain separate from empty groups. Truncated samples are labeled.
- Exact owned-copy selection when available. Pack mappings use opening slots plus subject/finish checks; ambiguous mappings require an explicit owned-copy selection. A card from someone else's auction never supplies ownership authority.
- Ordered album shortcuts, searchable album settings, per-account pins, Save/Cancel, local persistence, and a configurable hover delay (default 300 ms).
- Isolated styling, viewport-aware placement, keyboard dismissal, and support for native modal dialogs. Popup controls do not advance pack cards or activate underlying game actions.

## Development

Use Node.js 22.12+ and pnpm 11.25.0. There are no production package dependencies.

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm exec playwright install chromium
pnpm test:browser
```

| Command             | Purpose                                                                                                        |
| ------------------- | -------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`          | Rebuild the three extension entries on changes. Reload the extension in Chrome afterward.                      |
| `pnpm build`        | Build content script, service worker, options page, manifest, and PNG icons into `dist`.                       |
| `pnpm typecheck`    | Check strict TypeScript.                                                                                       |
| `pnpm test`         | Run Vitest parser, detector, cache, settings, messaging, and guarded-write tests.                              |
| `pnpm test:browser` | Load the actual unpacked extension in a persistent, disposable Chromium profile and test synthetic game pages. |
| `pnpm check`        | Typecheck, unit tests, and production build.                                                                   |

Browser tests intercept **all** requests to Kosmora and use synthetic fixtures, including album writes. They do not access the signed-in browser or a live game account. On Windows, if downloaded Chromium fails to start, the harness falls back to an installed Chromium-based Edge browser with an isolated profile. `KOSMORE_CHROMIUM_EXECUTABLE` can select another extension-capable Chromium executable. Modern branded Chrome ignores command-line unpacked-extension loading; use the normal Load unpacked workflow for manual Chrome testing.

## Architecture

- `src/kosmora`: the site's selectors, runtime response validators, authenticated request adapter, exact-copy mapping, and guarded album add operation.
- `src/content`: delegated hover/focus controller and a Shadow DOM popup rendered in the top layer. The active dialog owns the popup host when necessary.
- `src/shared`: typed contracts/messages, versioned storage, and bounded caches.
- `src/background.ts`: toolbar action and validated options-to-tab routing. It neither stores credentials nor maintains game state.
- `src/options`: full options page with account discovery and draft settings.

Game requests originate in the content script using the existing site's session. Only `storage` and `https://kosmora.io/*` access are requested. There is no telemetry, remote executable code, backend, account-password handling, or cloud sync. Read caches are bounded to 100 entries, expire after five minutes, and are cleared when the account changes.

## Verification and limits

The integration was checked against delivered public game bundles and signed-in **GET** responses. See [integration contracts](docs/INTEGRATION.md). Browser UI tests exercise the installed extension, actual service worker messaging, local storage, and mock network transport. Their screenshots are fixture previews, not live game screenshots.

**No live game-data writes were performed.** The album add transport is implemented from the observed client contract and tested with mocked responses, including uncertain timeouts. Successful real-server mutation and its immediate synchronization with Kosmora's own in-memory UI remain unverified. Membership is always reread by KosMore; the game may need its normal refresh to update its own display after an extension-initiated add.

The first UI is English and desktop-pointer oriented. Signed-in sessions are required for insights and album discovery. Account pins use the game's normalized handle because `/api/me` exposes that identity rather than an immutable user ID; renaming the handle creates a separate settings entry. The native game's 2,000-card album limit is enforced before writes, with the server remaining authoritative.

Game DOM/API changes can make a section unavailable. KosMore fails visibly rather than guessing identities, prices, or endpoints. An archived opening whose copy has left the account cannot authorize an add; choose an owned copy explicitly. Batch recaps are matched by opening order and slot, with identity validation. No game actions are automated, and Chrome Web Store publication is outside this repository's delivery.
