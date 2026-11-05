KosMore - Tester Installation and Setup
=======================================

KosMore adds card insights, pinned albums, friend reminders, and private
card notes to Kosmora. This is a development test build for desktop Chrome.
You do not need Node.js, pnpm, or the project's source code to install it.

INSTALL
-------
1. Extract the ZIP into a permanent folder, such as Documents\KosMore.
   Do not load it from inside the ZIP or move the folder after installing.
2. Open Chrome and enter chrome://extensions in the address bar.
3. Turn on Developer mode using the switch near the top of the page.
4. Click Load unpacked and select the extracted folder containing
   manifest.json. Select the folder itself, not an individual file.
5. Open https://kosmora.io and sign in normally. Refresh any game tabs
   that were already open when you installed the extension.

FIRST-TIME SETUP
----------------
1. Click Chrome's Extensions (puzzle piece) button, then KosMore to open
   its settings. You can pin KosMore to the toolbar for easier access.
2. Keep a signed-in Kosmora tab open. Click Refresh accounts if needed.
   If several accounts are found, choose the account to configure.
3. Pin the albums you want as shortcuts and use the arrows to order them.
4. Choose which popup stat boxes to show and use the arrows to order them.
   The settings preview uses example values, not live card prices.
5. Choose the hover and dismiss delays, popup width and height, and turn
   the sale, friend, and quest indicators on or off as desired. Click
   Save settings to keep your changes.

USING KOSMORE
--------------
- Hover a card to open its popup, including during pack reveals and on
  the pack summary. Move into the popup to use it; press Escape to close.
- Click the pin in the popup's top right to keep it visible. Drag its
  header to move it. Hover another card to update the pinned popup in
  place. Unpin to restore automatic dismissal; Close and Escape still work.
- Market shows a 30-day chart and recent completed sales. Variant filters
  save locally. Recent sales starts with five entries; Show All expands
  the returned list. "Latest X of Y" refers to the returned sale sample.
- Pinned album buttons add a card only when you click them. Already-added
  subjects are disabled. Choose an owned copy when prompted.
- The sell button in the header opens the game's sale-details form for
  the chosen owned copy. It does not submit a sale.
- Small indicators on cards and in the popup identify completed sale
  history, friends with matching saved families, and membership in any
  quest. A missing icon can also mean its data could not be loaded.
- On Social, select a friend. The KosMore panel below their information
  lets you select valid families and save private notes. Save reminders
  keeps both; Cancel restores the previous saved values.
- Trade lists current friends whose saved family preferences match the
  card. Set those preferences on Social first. These are suggestions,
  not confirmation that a friend explicitly wants the card.
- Notes saves private notes for the card, shared across its copies and
  variants for your current account. Use Save notes or Cancel notes.

PRIVACY AND TEST-BUILD LIMITATIONS
----------------------------------
Settings and notes stay in this browser profile. They do not sync to
other devices and are not shared with friends. Pins and notes are kept
separately by account handle; renaming an account creates a separate entry.
Removing the extension removes its local data, so avoid reinstalling it
when updating. KosMore uses your existing Kosmora session; never send your
password, cookies, session tokens, or browser-storage exports to anyone.

KosMore is an independent companion, not an official Kosmora product.
Game changes or server throttling can make data temporarily unavailable.
Prices can be based on a limited sample; the popup labels incomplete data.
Real-server album additions were not verified during development. Clicking
an enabled album button does change game data; loading the extension,
editing its local notes/settings, and hovering cards do not initiate game
actions. KosMore does not automatically buy, sell, trade, or open packs.

UPDATE AN EXISTING INSTALLATION
-------------------------------
This unpacked test build does not update automatically.
1. Extract the new ZIP separately, then replace the files in the same
   permanent folder used for the existing installation.
2. At chrome://extensions, find KosMore and click its Reload button.
   Keep the existing installation instead of using Remove and reinstalling.
3. Refresh your open Kosmora tabs and reopen the KosMore settings page.

TROUBLESHOOTING AND FEEDBACK
-----------------------------
If popups do not appear, confirm KosMore is enabled at chrome://extensions
and Enable card hover popups is checked in its settings. Refresh the game.
For missing albums, keep a signed-in game tab open and Refresh accounts.
On a server rate-limit message, wait before refreshing or trying again.

Report problems to the person who supplied this test build. Include:
- The KosMore version shown at chrome://extensions and your Chrome version.
- Which game screen you were on (collection, pack reveal, summary, etc.).
- Steps to reproduce, what you expected, and what actually happened.
- An optional screenshot with private information hidden.

If Chrome shows an Errors button for KosMore, include the relevant error
message after checking it for private information. Never include credentials
or session data in a report.
