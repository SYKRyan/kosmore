KosMore
-------

A browser extension that adds card insights, shortcuts, and private reminders
to Kosmora.

- Card tooltips: view market analytics, your listing history, matching
  friends, and private notes while browsing, including pack reveals, trade
  pickers, and Market Activity.
- Mobile-friendly controls: open tooltips with a Kosmora overlay button,
  optionally center them at full size, and dismiss them without activating the
  control underneath.
- Pinned albums: add owned copies to your favourite albums or remove cards
  from them through ordered tooltip shortcuts.
- Customizable statistics: choose and reorder price, interest, readership,
  auction, sales, and local sale-rate boxes.
- Card overlays: spot active auctions, recent sales, your listed cards, quest
  cards, and matches for friends' saved family preferences.
- Family impact: see whether fusing or trading a card would lower a family
  tier, accounting for other copies and cards already in the Fusion tray.
- Friend tooltip: expand matching friends' saved families and notes in a
  separate popup with Social and Profile links.
- Social and profile reminders: keep private family preferences and notes for
  players, with an optional pinned profile editor.
- Trade reminders: see preferred families, saved notes, and a rarity breakdown
  of your available matching cards while proposing a trade.
- Sales Overlay: compare Last Sale, Lowest Listed, and My Last Listing prices
  on single and batch selling screens, with independent click-to-fill
  adjustments.
- Navigation hotkeys: assign keyboard shortcuts to 15 Kosmora destinations.
- Backup & restore: export and import settings, album shortcuts, family
  preferences, and private notes across browsers or computers.
- Account-aware data: keep album shortcuts and private reminders associated
  with the correct Kosmora account.

Install & update
----------------

Install a release
-----------------

The release ZIP contains the ready-to-load extension. Node.js, pnpm, and a
source checkout are not required. KosMore targets Chromium-based browsers and
declares Chrome 120 as its minimum version.

1. Download the KosMore release ZIP and extract it to a permanent folder, such
   as Documents\KosMore.
2. Open your browser's Extensions page: chrome://extensions in Chrome,
   edge://extensions in Edge, or vivaldi://extensions in Vivaldi.
3. Turn on Developer mode, click Load unpacked, and select the extracted
   folder containing manifest.json.
4. Open Kosmora and refresh any tabs that were already open.
5. Open KosMore from the browser's Extensions menu to configure it. You can
   also use the Settings gear in a card tooltip.

Keep the extracted folder in place; the browser loads the extension from that
location.

Update an existing installation
-------------------------------

Unpacked installations require a manual update.

1. Optionally export a backup through KosMore settings → Backup & restore.
2. Extract the new release ZIP and replace the extension files in the same
   installation folder.
3. Open your browser's Extensions page and click Reload on KosMore. Keep the
   existing extension installed to preserve its settings and notes.
4. Refresh your Kosmora tabs and reopen KosMore settings.

Install or update from source
-----------------------------

Use Node.js 22.12 or newer and the pnpm version declared in package.json.

1. Obtain the source, or pull the latest changes in your existing checkout.
2. Run pnpm install, then pnpm build from the repository folder.
3. For a new installation, use Load unpacked to select the generated dist
   folder. For an update, reload the existing extension after rebuilding. If
   it loads from a separate folder, copy the rebuilt files there first.
4. Refresh your Kosmora tabs and reopen settings. Pulling source alone does
   not rebuild the extension.

Feature groups
--------------

The sections below follow the order shown in settings. Each feature group's
top-right switch saves and applies immediately. Other options use that group's
Save and Cancel buttons. Turning a group off disables its options and
Save/Cancel buttons while preserving its saved preferences. Unsaved option
edits remain available when you turn it back on in the same settings page.

Card overlays, Sales Overlay, profile reminders, trade reminders, and
navigation hotkeys can work with card hover tooltips turned off. Features
displayed inside the card tooltip need that tooltip enabled.

Hover tooltip
-------------

Hover a supported card, or press its overlay button when enabled, to open
KosMore's card popup. It includes rarity, finish, family links, market
indicators, album shortcuts, stat boxes, and four icon tabs. The last selected
tab is remembered for the next tooltip in that browser tab.

- Market (chart): completed-sale history, a price chart, and a per-finish
  summary for Standard, Shiny, and Full art. Toggle finishes to change the
  history and related statistics; expand recent sales with Show All. Last Sale
  and Listed For appear in the header when data exists; Listed For opens the
  card's Market search.
- My listing history (history): your original starting prices for this card
  across finishes, newest listings first. Auction end dates/times appear on
  the left and prices on the right. Selecting the tab loads one batch; Load
  more retrieves older listings. Leaving the tab stops its loading, and
  returning restores cached results. Incomplete results are identified; the
  Market tab does not request personal history.
- Trade (friends): current friends whose saved family preferences match the
  card. Expand a friend to see all saved families, highlighted matches,
  private notes, and Social/Profile links. One friend expands at a time; a
  single match opens automatically. This uses the same content and behavior as
  the companion friend tooltip.
- Notes: private notes for the card, shared across its copies and finishes
  within your account. Save or cancel edits here; these notes are stored in
  the extension.

Click a family badge to view that family in your collection. The footer's Sell
button opens Kosmora's sell form for an eligible owned copy; you still
complete the sale in Kosmora.

Pin the tooltip to keep it available across page navigation in the current
tab. Drag its header to move it and resize it from an edge or corner. Position
and dimensions save automatically. On a new page, a pinned tooltip shows No
Card Selected until you hover a card or press its overlay button. Unpin it to
return to opening beside cards. Use the header icons to refresh the selected
tab, pin/unpin, or close the tooltip.

Configurable options:

- Hover delay: 100–2,000 ms before opening; default 300 ms.
- Dismiss delay: 0–30,000 ms after leaving both the card and tooltip; default
  200 ms. Pinned tooltips stay open.
- Tooltip width and height: defaults 440 × 900 px, limited to the available
  screen space.
- Close Unpinned Tooltips When Added to Album: close after a successful album
  addition.
- Also Close Pinned Tooltips: a subsetting that extends the same close
  behavior to pinned tooltips.

The Mobile Friendly subgroup below tooltip height contains three options, all
off by default:

- Use Overlay Button Instead of Hover: press the round Kosmora logo near a
  card's bottom-left corner. Hover and link focus stay disabled while its
  button is showing, and press-opened tooltips stay open until dismissed. On
  Sell Many, the button anchors to the listing box; on Market Activity, it
  anchors to Your Turn, bids, sale boxes, and journal rows, including Day by
  Day. Buttons scroll with their controls and leave native actions available.
- Outside Click Closes Tooltip Only: an outside click/tap closes an unpinned
  tooltip without opening or selecting the card underneath. The next click
  works normally. Pinned tooltips retain their normal behavior.
- Full Screen & Centered on Open: fill the visible viewport with a 24-pixel
  margin for outside-click closing. Saved size and position return when this
  option is turned off; dragging and resizing are unavailable in this mode.

Pinned albums
-------------

Choose the albums that appear as shortcuts in the card tooltip. Keep a
signed-in Kosmora tab open and use Connected account to choose whose albums
you are configuring.

- Search Your albums, then pin or unpin entries.
- Reorder Pinned shortcuts with the move controls; the tooltip follows this
  order and displays three compact shortcuts per row, aligned with the stat
  boxes. Long album names use ellipses.
- Save the group to store the selection and order for that account.
- In a card tooltip, choose the owned copy when necessary and click an album
  shortcut to add it. Existing membership is shown, with a remove control for
  removing the card from that album.

Album actions use your signed-in Kosmora account. Unpinning a shortcut only
removes the shortcut from KosMore.

Tooltip stat boxes
------------------

Show, hide, and reorder individual statistics above the tooltip tabs. Settings
include a preview with example values.

- Min Price: lowest completed-sale price for the selected finishes.
- Median Price: median completed-sale price for the selected finishes.
- Max Price: highest completed-sale price for the selected finishes.
- Kosmora interest: number of players interested in the card.
- Wikipedia · recorded median/day: Kosmora's recorded median daily Wikipedia
  views.
- Sales · 30 days: completed-sale count across the selected finishes.
- Active Auctions: open, unexpired listings for the card across all finishes.
- Sale Rate · 30 days: the share of locally observed, settled listings that
  sold, followed by the sample size. For example, 50% · 4 means two of four
  settled listings sold.

Price calculations use the sale history returned by Kosmora. Sampled or
incomplete data is identified in the tooltip. New stat boxes are enabled
automatically without resetting your existing choices or ordering.

Sale Rate uses listings this browser sees while you browse the Market and
through KosMore's existing auction reads. Fresh sale histories resolve their
outcomes. It is a local sample, so it does not represent every listing on
Kosmora. A dash means no settled sample is available; 0% means a settled
sample exists with no sales. The Market tab's Sold column shows the rate and
sample size separately for each finish. Refresh checks fresh histories but
cannot recover listings this browser never saw.

Sale observations stay in this browser, are limited to 20,000 listings with
35-day retention, and are excluded from backups. Only listings ending within
the last 30 days contribute to the displayed rate.

Card overlays
-------------

Add indicators to visible cards and tooltip headers. Each indicator can be
configured independently:

- Active auctions: a red sale tag for current listings, with an optional
  lowest listed price. The price uses the highest bid, or the starting price
  when a listing has no bids, across all finishes. The badge links to the
  card's Market search.
- For Sale: a black-and-white label when you have a copy listed on the Market.
- Sale history: a gavel for final sale prices in the last 30 days, with an
  optional last sale price across all finishes.
- Interested friends: a purple friend indicator when the card's families match
  preferences you saved for current friends.
- Quest: a gold Quest badge when the card belongs to any quest, whether you
  follow it or not.
- Family impact on the Fusion page: a badge at the bottom left of each card's
  art showing ✓ Safe when no family loses a tier, or ⚠ Loses Asteroids I when
  fusing it drops that family from tier I. A +1 indicates another affected
  family. Counts include cards already in the tray and all families the card
  counts toward. Keeping another copy preserves that card's family
  contribution.
- Family impact on the Trade page: show Safe or the affected family tiers
  while choosing your card to trade. It uses the same family checks as Fusion;
  trading a copy preserves the family contribution when you still own another
  copy. This has its own Show family impact on the Trade page setting.

Fusion impact follows complete batches in the order you choose cards. A chosen
card still waiting for its batch has a dashed outline. Badges do not block
card selection. Use Show family impact on the Fusion page to turn them on or
off.

The price switches are subsettings of their respective indicators. Friend
indicators on cards are passive; use the indicator inside the card tooltip to
open the companion friend popup.

Compact Market Activity and journal thumbnails omit price/signal overlays.
They still support the tooltip overlay button when enabled.

Friend tooltip
--------------

Hover, focus, or click the purple friend indicator in the card tooltip header
to see matching friends. This companion popup has its own pin, drag, resize,
and timing controls.

- Click a friend to expand all their saved families and private notes.
  Matching families are highlighted.
- One friend expands at a time; a single matching friend expands
  automatically.
- Use Social or Profile to open that player's page. Edit their reminders
  there; the companion shows saved information.
- Pin the companion independently of the card tooltip. A pinned companion
  restores an empty view after page navigation until another card is selected.

Settings control the hover delay, dismiss delay, width, and height
independently of the main tooltip. Defaults are 300 ms, 200 ms, and 320 × 560
px. Position and dimensions save automatically. To open this popup, enable
card hover tooltips, Card overlays, the interested-friends indicator, and
Friend tooltip.

Profile reminders
-----------------

On a player's profile, open ✦ KosMore above the header to edit their private
family preferences and notes. This is the same reminder data used on Social,
in friend matches, and during trades. The player does not have to be in your
current friend list to have a profile reminder.

- Search for and add preferred card families, remove family tokens, and write
  private notes.
- Use Save to store edits or Cancel to restore the saved values.
- Pin the editor below the profile header and above Albums. Families appear on
  the left and notes on the right, stacking on narrow screens.
- While pinned, the standalone control above the header is hidden. Unpin from
  the widget to return to the popup. Moving between popup and widget preserves
  unsaved edits.
- Use Keep reminders pinned on profiles in settings to control the persistent
  pinned display.

On Social, select a friend to use the same family-and-notes editor. Social
editing remains available independently of the Profile reminders switch.
Preferences are private to your extension installation and account; saving
them does not update the player's Kosmora profile or send them a message.

Trade reminders
---------------

When proposing a trade, KosMore shows the selected player's saved family
preferences and a Possible Interest breakdown of your matching cards.

- On Their card, family badges sit below the “Only the cards…” text, above the
  breakdown and search bar.
- On Your card, the families and breakdown sit below the trade rule and above
  the search bar.
- On other trade steps, the family badges appear below the step numbers.
- A filled Notes badge appears after the family badges when saved notes exist,
  with a small disclosure icon when unpinned. Tap, hover, or focus to read
  them; pin them as a read-only Notes block below the badges and above
  Possible Interest. Unpin from the notes header.
- Counts include only your available matching copies, excluding locked copies
  and copies currently for sale. Standard, Shiny, and Full art copies are
  included, and each copy counts once even when families overlap.
- Results are grouped by rarity: Common, Uncommon, Rare, Epic, Legendary, and
  Mythic. Zero-count rarities and an empty breakdown are hidden. Filtering
  their cards does not change your counts.
- A spinner beside Possible Interest indicates calculation is in progress.
  Space is reserved for the counts to keep the search controls from shifting
  as results arrive.

Settings control preferred family badges, possible interest counts, and saved
notes separately. Use rarity symbols selects Kosmora's rarity gems instead of
names. Notes have their own pin setting, hover/dismiss delays, and tooltip
width/height controls. Save family preferences and notes on Social or the
player's profile.

Sales Overlay
-------------

Show price helpers beneath the starting-price field on both the single sell
screen and Sell Several Cards.

- Show Last Sale price: display the latest completed-sale price across all
  finishes in Kosmora's 30-day history.
- Show Lowest Listed price: display the lowest current listing price across
  all finishes, using the highest bid or the starting price when there are no
  bids.
- Show My Last Listing price: display your newest confirmed original starting
  price for the card, across finishes, labeled My Last Listing:. This uses
  your listing history rather than a winning bid or final sale price.
- Set price when clicked: each price has its own subsetting to fill that
  card's starting-price field when clicked.
- Price adjustment: add or subtract a fixed amount of Kosmo from the clicked
  price. For example, -1 prices one Kosmo lower. The default is 0, and
  adjustments support up to six decimal places. The resulting starting price
  must be greater than zero.

The price visibility options are checkboxes; click-to-fill options are nested
switches. Clicking a price fills only that card's starting price. Review and
submit listings using Kosmora's usual sale controls.

My Last Listing uses a small account-specific local cache that survives
browser restarts. Saved prices appear immediately; prices older than five
minutes are rechecked on sale screens or an active History tab. Lookups are
shared across cards/tabs, resolve each card independently, and stop once its
latest price is confirmed. Successful new listings invalidate the cache. A
first lookup for an older or never-listed card can take longer; it does not
require opening the full History tab.

Navigation hotkeys
------------------

Assign shortcuts for Home, Collection, Albums, Atlas, Social, Market, My
Auctions, My Activity, Alerts, Talents, Packs, Fusion, Pulsar, Odyssey, and My
Profile.

Click a shortcut control and press a letter, number, or F1–F12, optionally
with Ctrl, Alt, Shift, or Meta. Escape cancels recording; Clear removes a
binding. Save the group to apply your choices. Duplicate bindings are
rejected.

Shortcuts work on Kosmora pages and pause while typing in fields or editors.
Browser-reserved shortcuts may not reach KosMore.

Backup & restore
----------------

Move your saved KosMore data to another browser or computer through a JSON
file.

1. In the source browser, open Backup & restore → Export backup and save the
   file.
2. In the destination browser, open KosMore settings and choose that file in
   Backup & restore.
3. Review the import preview, select Merge or Replace, then click Import
   backup.

Backups include saved feature preferences, ordered pinned album shortcuts,
market finish filters, friend families and notes, and card notes for all saved
accounts. Account associations are preserved; sign into the original Kosmora
account to use its restored notes and shortcuts. Exporting and importing do
not require a signed-in game tab.

- Merge: retain destination-only entries and use backup values for matching
  settings and notes.
- Replace: remove existing supported entries absent from the backup. This
  requires confirmation; export the destination's data first if you want to
  keep a copy.

Save or cancel unsaved settings edits before importing. Unsaved edits,
temporary per-tab tooltip state, Sale Rate observations, and disposable
listing-history/price caches are excluded from backups. JSON files contain
readable private notes, so store them somewhere you trust.

Connected account
-----------------

Keep a signed-in Kosmora tab open, then select the account whose pinned albums
you want to configure. Use Refresh accounts after opening another game tab or
changing accounts.

The selection controls album configuration in settings. Features on Kosmora
pages use the account signed in on that page. Pinned shortcuts, friend
reminders, and card notes retain their account associations, including when
transferred in a backup. Market finish filters are shared across accounts in
this browser.
