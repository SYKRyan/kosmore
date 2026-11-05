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
- Minimum, median, and maximum price boxes above the existing interest/readership/sales stats. Prices follow the selected variants; combined prices from truncated histories are labeled as sample statistics.
- **Popup stat boxes** in Settings shows an example preview, visibility checkboxes, and up/down controls. Save applies the selected boxes and order to open popups; Cancel restores the saved layout. All six are enabled by default. Stat choices stay in this browser and are independent of account-specific album pins.
- A 30-day completed-sales chart and server-provided count/minimum/median/maximum for each of Standard, Shiny, and Full art. Variant checkboxes save locally across popups and browser restarts. Recent sales shows five entries initially; **Show All** expands every returned sale. Missing and failed groups remain separate from empty groups. Truncated samples are labeled.
- Exact owned-copy selection when available. Pack mappings use opening slots plus subject/finish checks; ambiguous mappings require an explicit owned-copy selection. A card from someone else's auction never supplies ownership authority.
- Ordered album shortcuts, searchable album settings, per-account pins, Save/Cancel, local persistence, and a configurable hover delay (default 300 ms).
- Pinned albums appear directly below the stat boxes. The header gavel opens Kosmora's sell form for the selected, freshly verified owned copy; it never submits a sale. Ambiguous copies require selection even when no albums are pinned.
- The popup opens on **Market**, with market history and recent sales. **Trade** lists current friends whose locally saved family preferences match one or more of the card's families, shows the matching families, and links to each friend on Social. Multiple matches rank first. **Notes** stores private notes per account and card, shared across copies and variants, with Save/Cancel controls. Matching uses saved preferences, not a claim that the friend explicitly marked interest in this card.
- Tabs sit below pinned albums. Selected stat boxes and the album section stay above the independently scrolling tab content. Scrollbars have a reserved gutter and content padding so they do not cover prices or controls.
- Small, display-only card-corner icons indicate completed sale history, matching friends, and membership in any quest (including unfollowed quests and already lit stars). Each has an independent, locally saved settings toggle. Visible cards are checked in a paced queue, with bounded caches and server cooldown handling. Icons never intercept card clicks. A failed lookup leaves its icon absent rather than implying a positive match.
- Applicable indicators also appear in the popup header and follow those same toggles. The separate sell button still opens the owned copy's sale-details form. Recent sales uses **Latest X of Y**, where Y is the returned sale sample across selected variants, and omits the old sales footer. The pinned-album copy subtitle and normal Social reminder helper texts are omitted.
- Isolated styling, viewport-aware placement, keyboard dismissal, and support for native modal dialogs. Popup controls do not advance pack cards or activate underlying game actions.
- Configurable popup width (320–1,200 pixels), height (480–1,600 pixels), and dismiss delay (0–30,000 ms) in Settings. Defaults remain 440 × 900 pixels and 200 ms after leaving the card and popup. Dimensions fit the viewport with 12-pixel margins and stay fixed during loading, filtering, tab changes, and **Show All**. Smaller popups allow scrolling to reach every section.
- The top-right pin keeps the popup visible. Drag its header to move it; hovering another card updates its contents while retaining its position and selected tab. Pinning and position last until dismissal on the current page; unpin restores automatic dismissal. Close and Escape work while pinned.
- On **Social**, select a friend to see private reminders headed by their name, with **Families they like** above **Notes**. Search Kosmora's family catalog, click a result or use arrow keys and Enter, and remove chips with ×. New tokens must match the game list; previously saved names remain intact. **Save reminders** stores both sections locally; **Cancel** restores the last saved values. Each account/friend pair has separate reminders. Nothing is posted to Kosmora or shared with friends. If the catalog is unavailable, retry it while continuing to edit notes.

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
| `pnpm package`      | Run `check`, then create a versioned tester ZIP and SHA-256 checksum in `releases`.                             |

## Share a tester build

Run `pnpm package`. It produces `releases/KosMore-<version>-test.zip` with `manifest.json` at its root, the runtime assets, and [README.txt](README.txt) for installation, setup, updates, and bug reports. Share the ZIP; testers extract it into a permanent folder and use Chrome's **Load unpacked** button. They do not need the repository or development tools. The adjacent `.zip.sha256` file records the archive checksum.

Packaging checks that `package.json` and `public/manifest.json` have the same numeric version. Increase both for a new tester release. The ZIP excludes source maps and local development files, strips source-map references from packaged scripts/styles, rejects unexpected build files or symlinks, and verifies every archived file against its input. Packaging leaves the debug-friendly `dist` files intact. Generated `releases/` artifacts are ignored by Git; running the command again replaces the ZIP for that version while keeping other versions.

Browser tests intercept **all** requests to Kosmora and use synthetic fixtures, including album writes. They do not access the signed-in browser or a live game account. On Windows, if downloaded Chromium fails to start, the harness falls back to an installed Chromium-based Edge browser with an isolated profile. `KOSMORE_CHROMIUM_EXECUTABLE` can select another extension-capable Chromium executable. Modern branded Chrome ignores command-line unpacked-extension loading; use the normal Load unpacked workflow for manual Chrome testing.

## Architecture

- `src/kosmora`: the site's selectors, runtime response validators, authenticated request adapter, exact-copy mapping, and guarded album add operation.
- `src/content`: delegated hover/focus controller and a Shadow DOM popup rendered in the top layer. The active dialog owns the popup host when necessary.
- `src/shared`: typed contracts/messages, versioned storage, and bounded caches.
- `src/background.ts`: toolbar action and validated options-to-tab routing. It neither stores credentials nor maintains game state.
- `src/options`: full options page with account discovery and draft settings.

### Adding a stat box

Add an entry to `STAT_CATALOG` in `src/shared/stat-catalog.ts` with a stable `id`, label, description, source, example preview, and `read(snapshot)` function. The generic `statBox` renderer, options preview, visibility controls, ordering, and saved-settings parser consume this catalog automatically. New entries append to existing layouts without resetting saved choices. Extend `StatSnapshot` and its pure builder if a new value needs more input; add any new data contract to the Kosmora adapter and deliver it to the snapshot. Keep reads and side effects out of stat definitions and rendering.

Game requests originate in the content script using the existing site's session. Only `storage` and `https://kosmora.io/*` access are requested. There is no telemetry, remote executable code, backend, account-password handling, or cloud sync. Read caches are bounded to 100 entries, expire after five minutes, and are cleared when the account changes.

## Verification and limits

The integration was checked against delivered public game bundles and signed-in **GET** responses. See [integration contracts](docs/INTEGRATION.md). Browser UI tests exercise the installed extension, actual service worker messaging, local storage, and mock network transport. Their screenshots are fixture previews, not live game screenshots.

Type checking, 76 unit tests, the production build, and all 36 unpacked-extension browser tests passed. On this Windows host the browser suite used isolated Chromium-based Edge with synthetic game responses. Coverage includes saved popup size and dismiss timing, live settings changes, pinning, header dragging, card changes at a fixed position, unpinning and dismissal, viewport bounds, and scrolling at the smallest configured size. Settings and pinned-popup screenshots were also visually inspected. These checks do not verify a live signed-in game session.

**No live game-data writes were performed.** The album add transport is implemented from the observed client contract and tested with mocked responses, including uncertain timeouts. Successful real-server mutation and its immediate synchronization with Kosmora's own in-memory UI remain unverified. Membership is always reread by KosMore; the game may need its normal refresh to update its own display after an extension-initiated add.

The first UI is English and desktop-pointer oriented. Signed-in sessions are required for insights and album discovery. Account pins use the game's normalized handle because `/api/me` exposes that identity rather than an immutable user ID; renaming the handle creates a separate settings entry. The native game's 2,000-card album limit is enforced before writes, with the server remaining authoritative.

Game DOM/API changes can make a section unavailable. KosMore fails visibly rather than guessing identities, prices, or endpoints. An archived opening whose copy has left the account cannot authorize an add; choose an owned copy explicitly. Batch recaps are matched by opening order and slot, with identity validation. No game actions are automated, and Chrome Web Store publication is outside this repository's delivery.
