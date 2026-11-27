# KosMore

A browser extension that adds card insights, shortcuts, and private reminders to Kosmora.

## Install & update

The release ZIP is ready to load in a Chromium-based browser. KosMore requires Chromium 120 or later.

### First installation

1. Download `KosMore-2.0.60.zip`. Extract it into a folder you will keep, such as `Documents\KosMore`. Open that folder and find `manifest.json`. This is the folder you will select in step 3.
2. Open the Extensions page in the browser you use for Kosmora. In Chrome, enter `chrome://extensions` in the address bar. In Edge, enter `edge://extensions`. In Vivaldi, enter `vivaldi://extensions`.
3. Turn on **Developer mode**. Select **Load unpacked**, choose the folder containing `manifest.json`, and confirm. The Extensions page should now list **KosMore 2.0.60**. Keep that folder in place.
4. Open Kosmora in the same browser profile and sign in to the player you want to link. Refresh any Kosmora tabs that were already open.
5. Open the browser’s **Extensions** menu and select **KosMore** to open Settings. Select the red **Connect Account** button at the top.
6. Leave the masked **KosMore Services API base URL** filled in. If you received a tester invite code, enter it. Select **Connect**, allow access to the Services host if prompted, and approve KosMore in the Kosmora sign-in window.
7. Return to KosMore Settings. A green **Connected to** badge showing your player handle confirms setup.

If the sign-in window does not open, select **Copy Link** in **Connected Account**. Paste the link into a new tab in the same browser profile, approve KosMore, then return to Settings. If needed, copy the **Sign-in link** field manually.

On **Vivaldi for Android**, extract the ZIP with your Files app. In Vivaldi, enable **Desktop Site**, then open **Extensions → Manage Extensions**. Continue at step 3 and tap **Select Folder** when prompted. [Vivaldi’s Android guide](https://help.vivaldi.com/android/android-tools/extensions-on-android/)

### Update an existing installation

You can update directly from 2.0.51. These steps also apply to other unpacked releases from 2.0.1 onward.

1. Open the browser profile where KosMore is already installed. For an optional backup, open **KosMore Settings → Backup & Restore → Export backup** and save the file.
2. Download `KosMore-2.0.60.zip` and extract it. Open the extracted folder that contains `manifest.json`.
3. Copy the **contents** of that folder into the folder your browser already uses for KosMore. Choose **Replace** or **Overwrite** when prompted. The new `manifest.json` should replace the old one at the same location.
4. On the browser’s Extensions page, find the existing **KosMore** entry and select **Reload** (the circular arrow). Check that the version now reads **2.0.60**.
5. Refresh your open Kosmora tabs and reopen KosMore Settings. If the green badge shows your handle, you’re done. If you see **Connect Account**, follow steps 5–7 under **First installation**. Your saved settings and notes carry over with an in-place update.

**Using a build from 2.0.0 or earlier with a different extension ID?** In the old installation, export a backup first. Disable that installation and follow **First installation** using a separate folder. In the new installation, open **Backup & Restore**, select the saved file, review the preview, and choose **Import backup**. Verify your notes and pinned albums before removing the old installation.

### Install or update from source

Use Node.js 22.12 or newer and the pnpm version declared in `package.json`.

1. Obtain the source, or pull the latest changes in your existing checkout.
2. Run `pnpm install`, then `pnpm build` from the repository folder.
3. For a new installation, use **Load unpacked** to select the generated `dist` folder. For an update, reload the existing extension after rebuilding. If it loads from a separate folder, copy the rebuilt files there first.
4. Refresh your Kosmora tabs and reopen settings. Pulling source alone does not rebuild the extension.

## Features at a glance

Connect your Kosmora account in **Settings → Connected Account** to load shared card prices, sales history, and auction snapshots from KosMore Services. Public auction prices have a five-minute provider delay. Linking the same player in another browser also brings over confirmed listing prices. Settings, notes, and pinned shortcuts move through **Backup & restore**.

- **Card tooltips:** view market analytics, your listing history, matching friends, and private notes while browsing, including pack reveals, trade pickers, and Market Activity.
- **Mobile-friendly controls:** open tooltips with a Kosmora overlay button, optionally center them at full size, and dismiss them without activating the control underneath.
- **Pinned albums:** add owned copies to your favourite albums or remove cards from them through ordered tooltip shortcuts.
  The tooltip selects the first owned copy in the list. If the hovered card identifies an exact copy, KosMore lists it first. You can choose another copy before using an album shortcut or a card action.
- **Customizable statistics:** choose and reorder price, auction, sales, and local sale-rate boxes.
- **Card overlays:** spot active auctions, recent sales, your listed cards, quest cards, and matches for friends' saved family preferences.
- **Friend tooltip:** expand matching friends' saved families and notes in a separate popup with Social and Profile links.
- **Social and profile reminders:** keep private family preferences and notes for players, with an optional pinned profile editor.
- **Trade reminders:** see preferred families, saved notes, and a rarity breakdown of your available matching cards while proposing a trade.
- **Sales Overlay:** compare market and listing prices, fill starting prices from presets or discounts, and flag prices below your rarity minimums.
- **Hotkeys:** assign shortcuts for 20 Kosmora destinations and for controls in the card tooltip.
- **Pack opening hotkeys:** open packs, inspect cards, and use summary actions with configurable shortcuts.
- **Backup & restore:** export and import settings, album shortcuts, family preferences, and private notes across browsers or computers.
- **Account-aware data:** keep album shortcuts and private reminders associated with the correct Kosmora account.

## Feature groups

The sections below follow the order shown in settings. Each feature group's top-right switch **saves and applies immediately**. Other options use that group's **Save** and **Cancel** buttons. Turning a group off disables its options and Save/Cancel buttons while preserving its saved preferences. Unsaved option edits remain available when you turn it back on in the same settings page.

Card overlays, Sales Overlay, profile reminders, trade reminders, and navigation hotkeys can work with card hover tooltips turned off. Features displayed inside the card tooltip need that tooltip enabled.

**Disable in Pulsar**, available separately under Hover tooltip and Card overlays, applies to Constellation, Aion, Photon, Horizon, Umbra, Parallax, Nadir, and Kepler. Vortex and the Pulsar hub keep their normal settings.

**Disable in Vortex** sits directly below each Pulsar control in Hover Tooltip and Card Overlays. Each option independently hides its feature throughout Vortex, including subpages, while preserving the main enabled switch. Both default to off. The hover option also hides tooltip open buttons; the overlay option also hides tooltip header indicators.

### Connected account

1. The **KosMore Services API base URL** is already filled in and masked. If you use a self-hosted service, enter its URL here. Enter your tester invite code if you received one.
2. Choose **Connect**, allow access to the Services host when prompted, and approve KosMore in the Kosmora sign-in window.
3. If the browser cannot open that window, choose **Copy Link** and paste the link into a new tab in the same browser profile. This also works as the first sign-in option. If the clipboard is unavailable, copy the **Sign-in link** field manually. The link expires after ten minutes.
4. Return to Settings and check the linked handle. Private open listings load on demand when the signed-in game account matches. The provider covers open single-card listings and omits lots and face-down listings.

The default URL follows extension updates. A custom URL stays in effect until you change it. To restore the default, clear the URL field and leave it. If the service address changes, choose **Connect** to link your account at the new address.

If Settings reports that access is blocked, ask the administrator to restore access and select **Retry access**. Use **Reconnect** for a new sign-in when needed. If an invite is reported as unavailable, request a new one.

**Disconnect** ends the player's Services sessions and retains synced listing history. **Erase synced listing history** asks for confirmation and clears that player's synced prices across linked browsers on their next sync.

To configure pinned albums, keep a Kosmora tab signed in as the linked player. **Pinned Albums** finds that tab automatically when you return to Settings.

Features on Kosmora pages use the account signed in on that page. Pinned shortcuts, friend reminders, and card notes retain their account associations, including when transferred in a backup. Market finish filters are shared across accounts in this browser.

### Hover tooltip

**UI Scale** adjusts the tooltip content, dimensions, and resize limits together. It starts at 100%. **Lock to browser zoom** keeps the tooltip at your chosen visual size as you zoom each game tab. You can edit the base percentage while locked. For example, a 75% base at 300% browser zoom uses a 25% effective scale.

Hover a supported card, or press its overlay button when enabled, to open KosMore's card popup. It includes rarity, finish, family links, market indicators, album shortcuts, stat boxes, and four icon tabs. The last selected tab is remembered for the next tooltip in that browser tab.

- The **Market** tab shows a price chart and summaries for Standard, Shiny, and Full art. Daily sale prices show the sale count, minimum, median, and maximum for each selected finish, grouped by UTC day from newest to oldest. **Last Sale** and **Listed For** appear in the header when data exists. A gold **#1** inside a Last Sale control identifies a sale of the number one copy. Select a chart point or a daily row to highlight its counterpart. Point details show the average when it can be calculated from cached prices. Listed For opens the card’s Market search.
- **My listing history:** My listing history combines saved starting prices with open single-card listings. Lots and face-down listings are omitted by Services. Refresh shows the available cached data.
- **Trade (friends):** current friends whose saved family preferences match the card. Expand a friend to see all saved families, highlighted matches, private notes, and **Social**/**Profile** links. One friend expands at a time; a single match opens automatically. This uses the same content and behavior as the companion friend tooltip.
- **Notes:** private notes for the card, shared across its copies and finishes within your account. Save or cancel edits here; these notes are stored in the extension.

Click a family badge to view that family in your collection. The footer's **Sell**, **Trade**, and **Gift** buttons open the corresponding Kosmora flow for an eligible owned copy. Complete the action in Kosmora.

Pin the card tooltip once to keep it in the same position across Kosmora tabs and browser restarts. Drag its header to move it in all tabs, or resize it from an edge or corner. On a new page, the pinned tooltip shows **No Card Selected** until you hover a card or press its overlay button. Close or Escape dismisses it for now. Choose **Unpin popup** to return to opening beside cards in every tab.

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

Choose the albums that appear as shortcuts in the card tooltip. Keep a Kosmora tab open and signed in as the player shown under **Connected Account**.

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
- **Sales · 30 days:** completed-sale count across the selected finishes.
- **Active Auctions:** open, unexpired listings matching the displayed card and finish.
- **Sale Rate · 30 days:** estimated share sold for the selected finishes, followed by the number of listings in the estimate.

Price calculations use the sales summary for each finish from Services. New stat boxes are enabled automatically without resetting your existing choices or ordering.

Sale Rate uses locally cached sales, daily history, and auctions, including stale snapshots. It divides sales by sales plus known unsold and still-open listings. Overlapping sources are counted once where identifiable. A dash means there is no sample. The Market tab shows the estimate per finish. Enabling the box makes no additional requests.

Sale observations stay in this browser, are limited to 20,000 listings with 35-day retention, and are excluded from backups. Only listings ending within the last 30 days contribute to the displayed rate.

### Card overlays

Add indicators to visible cards and tooltip headers. Each indicator can be configured independently:

- **Active auctions** shows the lowest observed auction price for the displayed finish. When you hold the lowest price, the card, tooltip, and sell button use the lowest competing listing available. If yours is the only listing, they use your price. With **Show bid counts** enabled, the numbered badge shows the bids on the displayed auction. Counts above nine appear as **9+**. Hover for the exact count. The card badge opens the Market search.
- **For Sale** appears only when you have a listing for the displayed finish. Confirming a listing or relist immediately compares its starting price with the cached market price. Changes and cancellations update the label across tabs for the same account. **Highlight my lowest listings** pulses the border green when you are lowest or tied. Once one of your listings for that finish receives a bid, the label turns steady green. With **Show bid counts** enabled, a numbered badge before **For Sale** shows the highest bid count on any one of your matching listings. **Warn when my listing is undercut** pulses the border red when another auction is cheaper and none of yours has a confirmed bid. Both highlights respect reduced motion.
- **Sale history:** a gavel for final sale prices in the last 30 days, with an optional last sale price for this finish.
- **Interested friends:** a purple friend indicator when the card's families match preferences you saved for current friends.

Click **For Sale** to open your active auction with the most bids for that card and finish. Ties favor the auction ending soonest. The **lowest listed price** badge turns green when yours is the only active auction for that finish.
- **Quest:** a gold Quest badge when the card belongs to any quest, whether you follow it or not.
  The price switches are subsettings of their respective indicators. Friend indicators on cards are passive; use the indicator inside the card tooltip to open the companion friend popup.

Compact Market Activity and journal thumbnails omit price/signal overlays. They still support the tooltip overlay button when enabled.

### Pack Openings

The **Pack Openings** switch starts on. Turn it off to pause pack price warnings, the remaining-pack count, pack shortcuts, automatic card focus, auto-skip, and found-pack dismissal in open game tabs. Turn it back on to use your saved settings and bindings again.

**Show Price Warning** starts off. Enable it to outline a pack-summary card in red when its finish’s last sale or median price exceeds your threshold. The price choice comes from Card Overlays. The pack threshold starts at 200 Kosmo and can be changed independently of Fusion.

Find the shortcuts under **Hotkeys → Pack Opening** and the automation and display options under **Pack Openings**. Pack hotkeys start off and bindings start empty. You can also record arrows, Home, and End. Use **Save** at the bottom of Hotkeys to apply changes across all three tabs.

**Show remaining pack count** starts on and shows the number of ready packs below the summary buttons.

**Open 10 at once** appears on a pack summary when you own the batch-opening talent and have at least ten other ready packs. Each click opens one batch and shows its recap. Under **Hotkeys → Pack Opening**, you can assign **Open 10 at once** to use the same shortcut on the Packs page and on summaries. The shortcut starts unassigned.

- **Next Card** tears the ready pack and steps through the reveal. A pinned tooltip follows each card as you advance. On the summary, use **Next Card**, **Previous Card**, **Focus First Card**, or **Focus Last Card** to inspect the grid with the tooltip. The selected card keeps focus while summary badges finish loading.
- **See Card** opens the focused card’s detail page. Press **Enter** on a focused summary card to use Kosmora’s close-up viewer.
- Hovering or focusing a later summary card, or using a card-navigation hotkey, cancels pending first-card autofocus for that opening.
- **Dismiss Found Pack**, **Skip Opening**, **Later**, **Share**, and **Home** activate the corresponding controls when Kosmora offers them. **Next Pack/Back to Packs** opens the next pack or returns to Packs when the summary offers that link.
- **Any key dismisses found pack** starts on under **Pack Openings**. Turn it off to use the **Dismiss Found Pack** keybind instead.
- **Auto-dismiss found pack** starts off. Turn it on to dismiss the full-screen Rogue and Mega pack alerts automatically. The found packs still appear on the summary.
- **Auto-skip on next pack** starts off. After you activate **Next Pack** by mouse or hotkey, it presses **Skip** once when the next pack appears. Kosmora’s reveal hints must be enabled so it can warn you about special packs.

### Sales Overlay

Show price helpers beneath the starting-price field on both the single sell screen and **Sell Several Cards**.

- **Show Last Sale price:** display the latest completed-sale price for this finish in Kosmora's 30-day history.
- **Show Lowest Listed price:** display the lowest observed auction price for this finish, using the highest bid or the starting price when there are no bids.
- **Show My Last Listing price:** display your newest confirmed original starting price for the card, across finishes, labeled **My Last Listing:**. This uses your listing history rather than a winning bid or final sale price.
- **Set price when clicked:** each price has its own subsetting to fill that card's starting-price field when clicked.
- **Price adjustment:** add or subtract a fixed amount of Kosmo from the clicked price. For example, `-1` prices one Kosmo lower. The default is `0`, and adjustments support up to six decimal places.
- **Show Discount button** lets you set a flat Kosmo amount or a percentage and choose how many consecutive unsold listings qualify. When saved history confirms that streak for the selected copy, **Discount** offers a lower starting price based on that copy’s most recent unsold listing. Refresh listing history if the relevant auctions are missing.
- **Show Custom Quick Prices** lets you add, reorder, or remove presets in settings. Click a preset on either sell screen to fill that card’s starting price.
- **Use Custom Rarity Minimums:** set your own minimum for each rarity at or above Kosmora’s minimum. KosMore warns beside the affected price and near the submit button. You can still submit a price that meets Kosmora’s minimum.

Discount, Quick Prices, and Custom Rarity Minimums are off by default. Price buttons fill only that card’s starting price and respect Kosmora’s minimum for its rarity. Review and submit listings using Kosmora’s usual sale controls.

My Last Listing uses submission time to select the latest confirmed starting price across finishes. Its local Sell badge also works offline after account verification. Use **Verify account** if the Sell page has yet to identify the signed-in player. Confirmed prices sync on connection, at browser startup, and about every five minutes while a Kosmora tab is open.

### Family Impact Overlay

Family Impact and its settings are disabled in the current build. The earlier Fusion **Next Batch** helper has also been removed. Check family tiers in Kosmora when choosing copies to fuse, trade, stake, or sell.

### Social

The Social switch turns reminders, trade reminders, and the friend tooltip on or off together. The **Reminders**, **Trade**, and **Tooltip** tabs keep their individual switches and preferences.

#### Reminders

On **Social**, select a friend and open **✦ KosMore** below the **Collection** and **Profile** links and above **Between You**. The launcher occupies the same location as the pinned editor. Pin the popup to keep the editor inline; unpin to return to a popup. Pinning and unpinning preserve unsaved edits.

In **Settings → Social → Reminders**, the master switch hides reminders on both pages and keeps your preferences. **Show on social page** and **Show on profile page** control where the editor appears. Each has its own pin switch. Both pages show reminders by default, with pinning off. They share private family preferences and notes for the selected player and signed-in account.

#### Profile reminders

On a player's profile, open **✦ KosMore** below the header and above Albums to edit their private family preferences and notes. The launcher occupies the pinned editor's location. This is the same reminder data used on Social, in friend matches, and during trades. The player does not have to be in your current friend list to have a profile reminder.

- Search for and add preferred card families, remove family tokens, and write private notes.
- Use **Save** to store edits or **Cancel** to restore the saved values.
- Pin the editor below the profile header and above Albums. Families appear on the left and notes on the right, stacking on narrow screens.
- While pinned, the standalone control is hidden. Unpin from the widget to return to the popup. Moving between popup and widget preserves unsaved edits.
- Use **Keep reminders pinned on profiles** in settings to control the persistent pinned display.

Preferences are private to your extension installation and account; saving them does not update the player's Kosmora profile or send them a message.

#### Trade

When proposing a trade, KosMore shows the selected player's saved family preferences. **Possible Interest** can show a breakdown by rarity once the game has loaded complete, sendable collection results for the matching families.

- On **Their card**, family badges sit below the “Only the cards…” text, above the breakdown and search bar.
- On **Your card**, the families and breakdown sit below the trade rule and above the search bar.
- On other trade steps, the family badges appear below the step numbers.
- A filled **Notes** badge appears after the family badges when saved notes exist, with a small disclosure icon when unpinned. Tap, hover, or focus to read them; pin them as a read-only **Notes** block below the badges and above Possible Interest. Unpin from the notes header.
- Counts include only your **available** matching copies, excluding locked copies and copies currently for sale. Standard, Shiny, and Full art copies are included, and each copy counts once even when families overlap.
- Results are grouped by rarity: Common, Uncommon, Rare, Epic, Legendary, and Mythic. Zero-count rarities and an empty breakdown are hidden. Filtering their cards does not change your counts.
- A spinner beside **Possible Interest** indicates calculation is in progress. Space is reserved for the counts to keep the search controls from shifting as results arrive.

Settings control **preferred family badges**, **possible interest counts**, and **saved notes** separately. **Use rarity symbols** selects Kosmora's rarity gems instead of names. Notes have their own pin setting, hover/dismiss delays, and tooltip width/height controls. Save family preferences and notes on Social or the player's profile.

#### Tooltip

Hover, focus, or click the purple friend indicator in the card tooltip header to see matching friends. This companion popup has its own pin, drag, resize, and timing controls.

- Click a friend to expand all their saved families and private notes. Matching families are highlighted.
- One friend expands at a time; a single matching friend expands automatically.
- Use **Social** or **Profile** to open that player's page. Edit their reminders there; the companion shows saved information.
- Pin the companion independently of the card tooltip. A pinned companion restores an empty view after page navigation until another card is selected.

In **Social → Tooltip**, width and height are measured at **100% UI Scale** and default to **320 × 560 px**. Set **UI Scale** in **Hover Tooltip** to scale both tooltips together. The Social Tooltip has its own **Lock to browser zoom** switch to keep its visual size as you zoom a game tab. The defaults are **100%** with the lock off. Dragging and resizing save the position and base dimensions automatically.

The friend tooltip's hover and dismiss delays default to **300 ms** and **200 ms**. To open this popup, enable card hover tooltips, Card overlays, the interested-friends indicator, and Friend tooltip.

### Hotkeys

Choose the Navigation, Pack Opening, or Hover Tooltip tab to edit its shortcuts. Each tab has its own enable switch. The shared **Save** and **Cancel** buttons apply to edits in all three tabs.

Under **Hotkeys → Navigation**, assign shortcuts for **Home**, **Collection**, **Albums**, **Tomes**, **Families**, **Fusion**, **Gallery**, **Quests**, **Atlas**, **Social**, **Market**, **My Auctions**, **My Activity**, **Alerts**, **Talents**, **Packs**, **History**, **Pulsar**, **Odyssey**, and **My Profile**.

Click a shortcut control and press a letter, number, or F1–F12, optionally with Ctrl, Alt, Shift, or Meta. Escape cancels recording and **Clear** removes a binding. Use **Save** at the bottom of Hotkeys to apply changes across all three tabs. KosMore checks for duplicate bindings across its shortcut groups.

Shortcuts work on Kosmora pages and pause while typing in fields or editors. Browser-reserved shortcuts may not reach KosMore. **Enable all hotkeys** controls every KosMore shortcut group, including pinned albums, and preserves saved bindings.

Under **Hotkeys → Hover Tooltip**, assign shortcuts to pin, refresh, or close the open tooltip, open Settings or the Market listing search, use Sell, Trade, or Gift, or switch tabs. You can also bind arrows, Home, and End. **Cycle Tabs** wraps from Notes to Market. **Next Tab** and **Previous Tab** stop at the ends. Escape also closes the tooltip.

### Backup & restore

Move your saved KosMore data to another browser or computer through a JSON file.

1. In the source browser, open **Backup & restore → Export backup** and save the file.
2. In the destination browser, open KosMore settings and choose that file in **Backup & restore**.
3. Review the import preview, select **Merge** or **Replace**, then click **Import backup**.

Backups include saved feature preferences, ordered pinned album shortcuts, market finish filters, friend families and notes, and card notes for all saved accounts. Account associations are preserved; sign into the original Kosmora account to use its restored notes and shortcuts. Exporting and importing do not require a signed-in game tab.

- **Merge:** retain destination-only entries and use backup values for matching settings and notes.
- **Replace:** remove existing supported entries absent from the backup. This requires confirmation; export the destination's data first if you want to keep a copy.

Save or cancel unsaved settings edits before importing. Backups exclude the Services connection, confirmed listing history, cached market data, Sale Rate observations, the card tooltip pin, and per-tab tooltip state. Reconnect the same player to recover previously synced starting prices. Backup files contain readable private notes, so store them somewhere you trust.
