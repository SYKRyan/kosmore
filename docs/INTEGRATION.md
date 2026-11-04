# Kosmora integration evidence

Inspected 2026-11-04. This is an observed private web-client contract, not a stability guarantee or an official public API. Never log authentication headers or commit account inventories. Fixtures in `tests/fixtures` are synthetic.

## Transport

The delivered request wrapper prefixes paths with `/api`, sends `credentials: same-origin`, and accepts JSON. Mutations additionally send `Content-Type: application/json` and `x-kosmora: 1`. KosMore implements only the explicit album add mutation. It never retries a POST automatically, never invokes the native membership-toggle button, and never calls DELETE.

| Request                                                         | Response used                                                                                                   | Evidence                                                                                                                  |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/me`                                                   | `handle`, nullable `currentOpening.id`                                                                          | Signed-in read; public request/session wrapper                                                                            |
| `GET /api/collection/{subjectId}`                               | `subjectId`, `name`, `rarity`, `interest.count`, `popularity.medianDailyViews`, `popularity.source`, `copies[]` | Signed-in read and card-detail client                                                                                     |
| `GET /api/cards/{subjectId}/prices?finish=plain\|veil\|fullart` | `{prices:{count,days,low,median,high,sales:[{auctionId,price,soldAt}]}}`                                        | Plain response read live; finish enumeration and schema checked in delivered CardSales module                             |
| `GET /api/albums`                                               | `{albums:[{id,name,items,...}]}`                                                                                | Native album list and picker code                                                                                         |
| `GET /api/albums?contains={subjectId}`                          | Album list plus `contains`, `containsCount`                                                                     | Signed-in read and picker code                                                                                            |
| `GET /api/openings/{openingId}`                                 | `id`, `state`, nullable `cards[]` with `slot`, `subjectId`, `instanceId`, `rarity`, `veil`, `card.fullArt`      | Read endpoint inspected in preparing state; populated schema and ordering established from delivered opening/recap client |
| `POST /api/albums/{albumId}/items`                              | Body `{subjectIds:[subjectId],copyId}`; response includes `added`                                               | Delivered native AlbumPicker add branch only; never exercised live                                                        |

Market amounts are integer strings in millionths of a Kosmo (`100000000` displays as `100`). Count/price summaries cover the response window; transactions can be a smaller sample. A response window other than 30 days is rejected until the integration is updated. Wikipedia medians may be fractional and are not counts of interested players.

## Important semantics

- Album containment is queried at the subject level, even when a particular owned copy is selected for addition. If the album already contains the subject, KosMore does not replace its selected copy or invoke an add/delete toggle.
- The native picker has separate POST-add and DELETE-remove branches. The UI itself chooses which to invoke based on `contains`. KosMore exposes only the add branch and checks containment again immediately before writing.
- A copy must still appear in the current signed-in account's `/collection/{subjectId}` response immediately before a write. A copy ID in a market, social, or card URL does not prove ownership.
- The native market finish selector uses `plain`, `veil`, and `fullart`. Copy flags preserve both `veil` and `fullArt`; visual recognition uses `.kc-veil`, `.kc-fa`, and reveal classes. Full art takes precedence in the native market finish classification.
- No dedicated fresh Wikipedia request is needed: the card detail already carries the recorded median and source.

## Pack identity and DOM mapping

The recap client flattens openings in the URL's order, sorts each opening's renderable cards by `slot`, and uses opening ID plus slot as the entry identity. The reveal client sorts standard before shiny before full-art, then ascending rarity and slot. KosMore reproduces this ordering only to obtain a candidate, then independently validates its subject and finish against the hovered DOM card and its exact instance against the owned-copy response.

Recap `.ko-grid > li` index, reveal `.ko-tray > li.on` count, and `.ko-viewer-count` provide the corresponding visible entry. Ambiguous or changed mappings fall back to an explicit owned-copy chooser. No private React props, fiber fields, hydration state, game local storage, or network interception hooks are used.

Verified selectors:

- Ordinary cards: `.kc-link`, `.kc-article`, `/card/{id}` links, `/media/cards/{id}/...` image URLs, `[data-testid=card-corner]`.
- Reveal: `.ko-card.ko-beat-shown .ko-face-front .kc-article`; ignore backs and hidden faces.
- Recap: `.ko-summary .ko-grid > li` and `.ko-grid-open` overlay.
- Native enlarged preview: `.ko-viewer-sheet`, `.ko-viewer-count`.

Delivered bundles consulted included `29r8uba_nhmde.js` (transport), `33yu_fe2y9x88.js` (card detail/owned copies), `18715hayuf10m.js` (price schema and finish selector), `0ihvnr133opgk.js` (album add/remove branches and viewer), and `12fwyn7dj2o02.js` (opening cards and ordering). Hash-based filenames are evidence labels, not runtime dependencies.

## Remaining live verification

Real album writes, server-side rejection details, full-art/shiny populated live sale responses, and populated opening payloads were not exercised under the read-only restriction. These paths are implemented from the delivered client and tested against synthetic contract fixtures. Do not describe fixture writes as successful real-game writes.
