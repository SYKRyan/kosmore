# KosMore

A browser extension that adds card insights, shortcuts, and private reminders to Kosmora.

- **Card tooltips:** view market analytics, your listing history, matching friends, and private notes while browsing, including pack reveals, trade pickers, and Market Activity.
- **Mobile-friendly controls:** open tooltips with a Kosmora overlay button, optionally center them at full size, and dismiss them without activating the control underneath.
- **Pinned albums:** add owned copies to your favourite albums or remove cards from them through ordered tooltip shortcuts.
- **Customizable statistics:** choose and reorder price, interest, readership, auction, sales, and local sale-rate boxes.
- **Card overlays:** spot active auctions, recent sales, your listed cards, quest cards, and matches for friends' saved family preferences.
- **Family impact:** see whether fusing, trading, selling, or losing cards in Vortex would lower a family tier, accounting for other copies and the current batch or selection.
- **Friend tooltip:** expand matching friends' saved families and notes in a separate popup with Social and Profile links.
- **Social and profile reminders:** keep private family preferences and notes for players, with an optional pinned profile editor.
- **Trade reminders:** see preferred families, saved notes, and a rarity breakdown of your available matching cards while proposing a trade.
- **Sales Overlay:** compare Last Sale, Lowest Listed, and My Last Listing prices on single and batch selling screens, with independent click-to-fill adjustments.
- **Navigation hotkeys:** assign keyboard shortcuts to 16 Kosmora destinations.
- **Pack opening hotkeys:** open packs, inspect cards, and use summary actions with configurable shortcuts.
- **Backup & restore:** export and import settings, album shortcuts, family preferences, and private notes across browsers or computers.
- **Account-aware data:** keep album shortcuts and private reminders associated with the correct Kosmora account.

## Install & update

### Install a release

The release ZIP contains the ready-to-load extension. Node.js, pnpm, and a source checkout are not required. KosMore targets Chromium-based browsers and declares Chrome 120 as its minimum version.

1. Download the KosMore release ZIP and extract it to a permanent folder, such as `Documents\KosMore`.
2. Open your browser's Extensions page: `chrome://extensions` in Chrome, `edge://extensions` in Edge, or `vivaldi://extensions` in Vivaldi.
3. Turn on **Developer mode**, click **Load unpacked**, and select the extracted folder containing `manifest.json`.
4. Open Kosmora and refresh any tabs that were already open.
5. Open KosMore from the browser's Extensions menu to configure it. You can also use the **Settings gear** in a card tooltip.

Keep the extracted folder in place; the browser loads the extension from that location.

### Update an existing installation

Unpacked installations require a manual update.

1. Optionally export a backup through **KosMore settings → Backup & restore**.
2. Extract the new release ZIP and replace the extension files in the same installation folder.
3. Open your browser's Extensions page and click **Reload** on KosMore. Keep the existing extension installed to preserve its settings and notes.
4. Refresh your Kosmora tabs and reopen KosMore settings.

### Install or update from source

Use Node.js 22.12 or newer and the pnpm version declared in `package.json`.

1. Obtain the source, or pull the latest changes in your existing checkout.
2. Run `pnpm install`, then `pnpm build` from the repository folder.
3. For a new installation, use **Load unpacked** to select the generated `dist` folder. For an update, reload the existing extension after rebuilding. If it loads from a separate folder, copy the rebuilt files there first.
4. Refresh your Kosmora tabs and reopen settings. Pulling source alone does not rebuild the extension.

## Feature groups

The sections below follow the order shown in settings. Each feature group's top-right switch **saves and applies immediately**. Other options use that group's **Save** and **Cancel** buttons. Turning a group off disables its options and Save/Cancel buttons while preserving its saved preferences. Unsaved option edits remain available when you turn it back on in the same settings page.

Card overlays, Family Impact Overlay, Sales Overlay, profile reminders, trade reminders, and navigation hotkeys can work with card hover tooltips turned off. Features displayed inside the card tooltip need that tooltip enabled.

**Disable in Pulsar**, available separately under Hover tooltip and Card overlays, applies to Constellation, Aion, Photon, Horizon, and Umbra. Vortex and the Pulsar hub keep their normal settings.

**Disable in Vortex** sits directly below each Pulsar control in Hover Tooltip and Card Overlays. Each option independently hides its feature throughout Vortex, including subpages, while preserving the main enabled switch. Both default to off. The hover option also hides tooltip open buttons; the overlay option also hides tooltip header indicators.

### Hover tooltip

Hover a supported card, or press its overlay button when enabled, to open KosMore's card popup. It includes rarity, finish, family links, market indicators, album shortcuts, stat boxes, and four icon tabs. The last selected tab is remembered for the next tooltip in that browser tab.

- **Market (chart):** completed-sale history, a price chart, and a per-finish summary for Standard, Shiny, and Full art. Toggle finishes to change the history and related statistics; expand recent sales with **Show All**. **Last Sale** and **Listed For** appear in the header when data exists; Listed For opens the card's Market search.
- **My listing history (history):** saved starting prices across finishes. The tab opens from local storage. **Load more** scans older listings and saves matching results. The refresh icon checks your newest 180 auctions. Rows distinguish captured submission times from auction end times.
- **Trade (friends):** current friends whose saved family preferences match the card. Expand a friend to see all saved families, highlighted matches, private notes, and **Social**/**Profile** links. One friend expands at a time; a single match opens automatically. This uses the same content and behavior as the companion friend tooltip.
- **Notes:** private notes for the card, shared across its copies and finishes within your account. Save or cancel edits here; these notes are stored in the extension.

Click a family badge to view that family in your collection. The footer's **Sell** button opens Kosmora's sell form for an eligible owned copy; you still complete the sale in Kosmora.

Pin the tooltip to keep it available across page navigation in the current tab. Drag its header to move it and resize it from an edge or corner. Position and dimensions save automatically. On a new page, a pinned tooltip shows **No Card Selected** until you hover a card or press its overlay button. Unpin it to return to opening beside cards. Use the header icons to refresh the selected tab, pin/unpin, or close the tooltip.

Configurable options:

- **Hover delay:** 100–2,000 ms before opening; default 300 ms.
- **Dismiss delay:** 0–30,000 ms after leaving both the card and tooltip; default 200 ms. Pinned tooltips stay open.
- **Tooltip width and height:** defaults 440 × 900 px, limited to the available screen space.
- **Close Unpinned Tooltips When Added to Album:** close after a successful album addition.
- **Also Close Pinned Tooltips:** a subsetting that extends the same close behavior to pinned tooltips.

The **Mobile Friendly** subgroup below tooltip height contains three options, all off by default:

- **Use Overlay Button Instead of Hover:** press the round Kosmora logo near a card's bottom-left corner. Hover and link focus stay disabled while its button is showing, and press-opened tooltips stay open until dismissed. On Sell Many, the button anchors to the listing box; on Market Activity, it anchors to Your Turn, bids, sale boxes, and journal rows, including Day by Day. Buttons scroll with their controls and leave native actions available.
- **Outside Click Closes Tooltip Only:** an outside click/tap closes an unpinned tooltip without opening or selecting the card underneath. The next click works normally. Pinned tooltips retain their normal behavior.
- **Full Screen & Centered on Open:** fill the visible viewport with a 24-pixel margin for outside-click closing. Saved size and position return when this option is turned off; dragging and resizing are unavailable in this mode.

### Pinned albums

Choose the albums that appear as shortcuts in the card tooltip. Keep a signed-in Kosmora tab open and use **Connected account** to choose whose albums you are configuring.

- Search **Your albums**, then pin or unpin entries.
- Reorder **Pinned shortcuts** with the move controls; the tooltip follows this order and displays three compact shortcuts per row, aligned with the stat boxes. Long album names use ellipses.
- Record or clear an album hotkey in its **Pinned shortcuts** row. With a card tooltip open, press the saved hotkey to use the album button for the selected copy. Save the group to store the pins, order, and hotkeys for that account.
- In a card tooltip, choose the owned copy when necessary and click an album shortcut to add it. Existing membership is shown, with a remove control for removing the card from that album.

Album actions use your signed-in Kosmora account. Unpinning a shortcut only removes the shortcut from KosMore.

### Tooltip stat boxes

Show, hide, and reorder individual statistics above the tooltip tabs. Settings include a preview with example values.

- **Min Price:** lowest completed-sale price for the selected finishes.
- **Median Price:** median completed-sale price for the selected finishes.
- **Max Price:** highest completed-sale price for the selected finishes.
- **Kosmora interest:** number of players interested in the card.
- **Wikipedia · recorded median/day:** Kosmora's recorded median daily Wikipedia views.
- **Sales · 30 days:** completed-sale count across the selected finishes.
- **Active Auctions:** open, unexpired listings for the card across all finishes.
- **Sale Rate · 30 days:** the share of locally observed, settled listings that sold, followed by the sample size. For example, **50% · 4** means two of four settled listings sold.

Price calculations use the sale history returned by Kosmora. Sampled or incomplete data is identified in the tooltip. New stat boxes are enabled automatically without resetting your existing choices or ordering.

Sale Rate uses listings this browser sees while you browse the Market and through KosMore's existing auction reads. Fresh sale histories resolve their outcomes. It is a local sample, so it does not represent every listing on Kosmora. A dash means no settled sample is available; **0%** means a settled sample exists with no sales. The Market tab's **Sold** column shows the rate and sample size separately for each finish. **Refresh** checks fresh histories but cannot recover listings this browser never saw. **Collect Sale Rate data** at the bottom of Tooltip Stat Boxes is on by default. Turn it off to pause collection and settlement on open tabs. The Sale Rate box keeps its place and opens the setting when clicked while paused.

Sale observations stay in this browser, are limited to 20,000 listings with 35-day retention, and are excluded from backups. Only listings ending within the last 30 days contribute to the displayed rate.

### Card overlays

Add indicators to visible cards and tooltip headers. Each indicator can be configured independently:

- **Active auctions:** a red sale tag for current listings, with an optional lowest listed price. The price uses the highest bid, or the starting price when a listing has no bids, across all finishes. The badge links to the card's Market search.
- **For Sale:** a black-and-white label when you have a copy listed on the Market.
- **Sale history:** a gavel for final sale prices in the last 30 days, with an optional last sale price across all finishes.
- **Interested friends:** a purple friend indicator when the card's families match preferences you saved for current friends.
- **Quest:** a gold Quest badge when the card belongs to any quest, whether you follow it or not.
  The price switches are subsettings of their respective indicators. Friend indicators on cards are passive; use the indicator inside the card tooltip to open the companion friend popup.

Compact Market Activity and journal thumbnails omit price/signal overlays. They still support the tooltip overlay button when enabled.

### Family Impact Overlay

This group has its own master switch and separate **Show on Fusion page**, **Show on Trade page**, **Show on Vortex page**, and **Show on Sell pages** checkboxes. All default to on. Card overlays and Sales Overlay price badges can be turned off separately.

The **Blacklist** subsection contains **Use Family Blacklist**, off by default, and the same searchable family tokens used for friend interests. Enable it, add families, then save the group. An otherwise Safe card matching any listed family shows a red **Blacklist** tag across all family-impact screens; tier-loss warnings keep their normal labels. Matching runs only while rendering with the feature enabled, reusing loaded card families without extra reads. Turning it off preserves the saved tokens, and backups include both the option and list.

- **Fusion:** badges at the bottom left of card art show **✓ Safe** or **⚠ Loses Asteroids I**. Checks count all economic families, other copies, and cards already in the tray. Complete batches follow selection order; cards waiting for a batch have a dashed outline. A `+1` identifies another affected family.
- **Trade:** check your card choices against losing one copy, keeping the family contribution when you still own another copy.
- **Vortex:** check stake cards and the card picker against losing one copy. Counts and ownership refresh after spins.
- **Sale screens:** Sell Many updates badges while you select or deselect cards, before Continue. Selected cards and prospective additions account for the current selection, including cards hidden by filters or pagination. Single-sale and batch-sale drafts show badges beneath each listing's price controls, outside the card art. Checks assume the submitted copies sell; removing a listing recalculates the remaining batch, including shared families and copies across finishes.

Badges do not block native actions. Sale checks reserve space with a gray **Calculating…** badge while loading, then show Safe or family impact without changing the row height. Batch sale badges sit at the bottom right of each listing. Unavailable sale impact stays gray; other family checks stay hidden while required data is unknown.

### Friend tooltip

Hover, focus, or click the purple friend indicator in the card tooltip header to see matching friends. This companion popup has its own pin, drag, resize, and timing controls.

- Click a friend to expand all their saved families and private notes. Matching families are highlighted.
- One friend expands at a time; a single matching friend expands automatically.
- Use **Social** or **Profile** to open that player's page. Edit their reminders there; the companion shows saved information.
- Pin the companion independently of the card tooltip. A pinned companion restores an empty view after page navigation until another card is selected.

Settings control the hover delay, dismiss delay, width, and height independently of the main tooltip. Defaults are **300 ms**, **200 ms**, and **320 × 560 px**. Position and dimensions save automatically. To open this popup, enable card hover tooltips, Card overlays, the interested-friends indicator, and Friend tooltip.

### Social Reminders

On **Social**, select a friend and open **✦ KosMore** below the **Collection** and **Profile** links and above **Between You**. The launcher occupies the same location as the pinned editor. Pin the popup to keep the editor inline; unpin to return to a popup. Pinning and unpinning preserve unsaved edits.

In **Settings → Social Reminders**, the master switch hides reminders on both pages and keeps your preferences. **Show on social page** and **Show on profile page** control where the editor appears. Each has its own pin switch. Both pages show reminders by default, with pinning off. They share private family preferences and notes for the selected player and signed-in account.

### Profile Reminders

On a player's profile, open **✦ KosMore** below the header and above Albums to edit their private family preferences and notes. The launcher occupies the pinned editor's location. This is the same reminder data used on Social, in friend matches, and during trades. The player does not have to be in your current friend list to have a profile reminder.

- Search for and add preferred card families, remove family tokens, and write private notes.
- Use **Save** to store edits or **Cancel** to restore the saved values.
- Pin the editor below the profile header and above Albums. Families appear on the left and notes on the right, stacking on narrow screens.
- While pinned, the standalone control is hidden. Unpin from the widget to return to the popup. Moving between popup and widget preserves unsaved edits.
- Use **Keep reminders pinned on profiles** in settings to control the persistent pinned display.

Preferences are private to your extension installation and account; saving them does not update the player's Kosmora profile or send them a message.

### Trade reminders

When proposing a trade, KosMore shows the selected player's saved family preferences and a **Possible Interest** breakdown of your matching cards.

- On **Their card**, family badges sit below the “Only the cards…” text, above the breakdown and search bar.
- On **Your card**, the families and breakdown sit below the trade rule and above the search bar.
- On other trade steps, the family badges appear below the step numbers.
- A filled **Notes** badge appears after the family badges when saved notes exist, with a small disclosure icon when unpinned. Tap, hover, or focus to read them; pin them as a read-only **Notes** block below the badges and above Possible Interest. Unpin from the notes header.
- Counts include only your **available** matching copies, excluding locked copies and copies currently for sale. Standard, Shiny, and Full art copies are included, and each copy counts once even when families overlap.
- Results are grouped by rarity: Common, Uncommon, Rare, Epic, Legendary, and Mythic. Zero-count rarities and an empty breakdown are hidden. Filtering their cards does not change your counts.
- A spinner beside **Possible Interest** indicates calculation is in progress. Space is reserved for the counts to keep the search controls from shifting as results arrive.

Settings control **preferred family badges**, **possible interest counts**, and **saved notes** separately. **Use rarity symbols** selects Kosmora's rarity gems instead of names. Notes have their own pin setting, hover/dismiss delays, and tooltip width/height controls. Save family preferences and notes on Social or the player's profile.

### Sales Overlay

Show price helpers beneath the starting-price field on both the single sell screen and **Sell Several Cards**.

- **Show Last Sale price:** display the latest completed-sale price across all finishes in Kosmora's 30-day history.
- **Show Lowest Listed price:** display the lowest current listing price across all finishes, using the highest bid or the starting price when there are no bids.
- **Show My Last Listing price:** display your newest confirmed original starting price for the card, across finishes, labeled **My Last Listing:**. This uses your listing history rather than a winning bid or final sale price.
- **Set price when clicked:** each price has its own subsetting to fill that card's starting-price field when clicked.
- **Price adjustment:** add or subtract a fixed amount of Kosmo from the clicked price. For example, `-1` prices one Kosmo lower. The default is `0`, and adjustments support up to six decimal places. The resulting starting price must be greater than zero.

The price visibility options are checkboxes; click-to-fill options are nested switches. Clicking a price fills only that card's starting price. Review and submit listings using Kosmora's usual sale controls.

My Last Listing shows the saved starting price for the card. KosMore saves up to 100 listings per account and card. Use the refresh icon on either sale screen or in tooltip History to check your newest 180 auctions across all statuses. **Load more** in History searches older listings and saves the results for the next visit.

### Navigation hotkeys

Assign shortcuts for **Home**, **Collection**, **Albums**, **Atlas**, **Social**, **Market**, **My Auctions**, **My Activity**, **Alerts**, **Talents**, **Packs**, **History**, **Fusion**, **Pulsar**, **Odyssey**, and **My Profile**.

Click a shortcut control and press a letter, number, or F1–F12, optionally with Ctrl, Alt, Shift, or Meta. Escape cancels recording; **Clear** removes a binding. Save the group to apply your choices. Duplicate bindings are rejected.

Shortcuts work on Kosmora pages and pause while typing in fields or editors. Browser-reserved shortcuts may not reach KosMore.

### Pack Openings

Find **Pack Openings** just below **Navigation Hotkeys**. Its hotkeys start off and bindings start empty. You can also record arrows, Home, and End. Save the group to apply your choices.

**Show remaining pack count** starts on and shows the number of ready packs above **Open the Next Pack**.

- **Next Card** tears the ready pack and steps through the reveal. A pinned tooltip follows each card as you advance. On the summary, use **Next Card**, **Previous Card**, **Focus First Card**, or **Focus Last Card** to inspect the grid with the tooltip.
- **See Card** opens the focused card’s detail page. Press **Enter** on a focused summary card to use Kosmora’s close-up viewer.
- **Dismiss Found Pack**, **Skip Opening**, **Later**, **Share**, and **Home** activate the corresponding controls when Kosmora offers them. **Next Pack/Back to Packs** opens the next pack or returns to Packs when the summary offers that link.
- **Any key dismisses found pack** starts on. Turn it off to use the **Dismiss Found Pack** keybind instead.
- **Auto-dismiss found pack** starts off. Turn it on to dismiss the full-screen Rogue and Mega pack alerts automatically. The found packs still appear on the summary.
- **Auto-skip on next pack** starts off. After you activate **Next Pack** by mouse or hotkey, it presses **Skip** once when the next pack appears. Kosmora’s reveal hints must be enabled so it can warn you about special packs.

### Backup & restore

Move your saved KosMore data to another browser or computer through a JSON file.

1. In the source browser, open **Backup & restore → Export backup** and save the file.
2. In the destination browser, open KosMore settings and choose that file in **Backup & restore**.
3. Review the import preview, select **Merge** or **Replace**, then click **Import backup**.

Backups include saved feature preferences, ordered pinned album shortcuts, market finish filters, friend families and notes, and card notes for all saved accounts. Account associations are preserved; sign into the original Kosmora account to use its restored notes and shortcuts. Exporting and importing do not require a signed-in game tab.

- **Merge:** retain destination-only entries and use backup values for matching settings and notes.
- **Replace:** remove existing supported entries absent from the backup. This requires confirmation; export the destination's data first if you want to keep a copy.

Save or cancel unsaved settings edits before importing. Unsaved edits, temporary per-tab tooltip state, Sale Rate observations, and disposable listing-history/price caches are excluded from backups. JSON files contain readable private notes, so store them somewhere you trust.

### Connected account

Keep a signed-in Kosmora tab open, then select the account whose pinned albums you want to configure. Use **Refresh accounts** after opening another game tab or changing accounts.

The selection controls album configuration in settings. Features on Kosmora pages use the account signed in on that page. Pinned shortcuts, friend reminders, and card notes retain their account associations, including when transferred in a backup. Market finish filters are shared across accounts in this browser.
