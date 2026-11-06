## Install

1. Extract the release ZIP to a permanent folder, such as `Documents\KosMore`.
2. In Chrome, open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the extracted folder containing `manifest.json`.
4. Open Kosmora and refresh any tabs that were already open.
5. Click KosMore in Chrome's Extensions menu to configure it. The top-right feature switches save and apply immediately. Use Save for other settings changes; Save and Cancel are disabled while a feature is off. Unsaved options remain available when you turn it back on.

## Update

1. Extract the new ZIP and replace the files in the same folder used for your existing installation.
2. Open `chrome://extensions` and click **Reload** on KosMore. Keep the existing extension installed to preserve settings and notes.
3. Refresh your Kosmora tabs and reopen KosMore settings.

## Move settings to another browser or computer

Open **KosMore settings → Backup & restore → Export backup**. Save the JSON file, then open **Backup & restore** in the destination browser, choose that file, review the preview, and click **Import backup**. No signed-in Kosmora tab is required.

Backups include saved preferences, ordered pinned album shortcuts, market filters, friend families and notes, and card notes for all saved accounts. Unsaved edits and temporary per-tab pinning state are excluded. Notes remain associated with the original Kosmora account; sign into that account to use them.

**Merge** keeps destination-only entries and uses backup values for matching settings and notes. **Replace** removes existing supported entries absent from the backup and requires confirmation. Save or cancel unsaved settings edits before importing. Export a copy of the destination browser's data first if you want to keep it.

JSON backups contain readable private notes. Keep the file somewhere you trust.

## Friend tooltips

Hover or focus the purple friend indicator inside the card hover tooltip to see matching friends. Click a name to expand all families and notes you saved for that friend; only one friend expands at a time. If just one friend matches, their details are always expanded. Social opens the friend’s Social selection, and Profile opens their profile. Edit the saved preferences and notes on Social or profiles. Card overlay icons remain passive indicators.

**Settings → Friend tooltip**, directly after Card overlays, controls this popup independently: enable/disable, hover delay, dismiss delay, width, and height. You can also pin, drag, and resize it. Its saved preferences travel with JSON backups.

### Profile reminders

On a player's profile, click **✦ KosMore** above the header to edit the same private family preferences and notes used on Social. The top-right pin moves the editor into a profile widget above Albums, with families on the left and notes on the right (stacked on narrow screens). When pinned, the standalone control above the header is hidden and the KosMore label sits at the top left of the widget, with the unpin button at the top right. Pinning keeps the widget available on other profiles; unpin to return to the popup. The notes box tracks the token box’s height as families are added or removed. Add sits below the token box on the right. Status messages sit at the bottom left, with Cancel and Save grouped on the right in both profile and Social editors. Save and Cancel work as on Social, and moving between popup and widget preserves unsaved edits.

**Settings → Profile reminders** can disable this feature or choose whether reminders stay pinned. Notes and profile display preferences are included in Backup & restore.

### Trade reminders

When proposing a trade, the selected player's saved families appear below the “Only the cards…” text and above **Possible Interest** on **Their card**. On **Your card**, the families and breakdown also appear above the search bar, below the trade rule. On other trade steps, the families appear below the step numbers. **Possible Interest** shows how many of your available copies match any of those families, grouped by rarity using Kosmora's gem symbols. Counts cover the full matching collection, exclude locked copies and cards for sale, include available shiny and full art copies, and count a copy only once when families overlap. Zero-count rarities and an empty breakdown stay hidden. Search filters on their cards do not change your counts.

**Settings → Trade reminders**, immediately after Profile reminders, lets you enable the feature, show or hide family badges and interest counts independently, and use rarity names instead of symbols. This group has its own Save and Cancel controls, works independently of hover tooltips, and is included in Backup & restore.

## Sale rate

**Settings → Tooltip stat boxes → Sale Rate · 30 days** shows the share of this card's observed listings that sold, plus the settled sample size, across the selected finishes. The Market tab's **Sold** column shows the rate and sample size separately for Standard, Shiny, and Full art. New stat boxes are enabled automatically without resetting existing choices or ordering.

Kosmora does not report all unsold listings, so this is a local sample built from listings KosMore sees while you browse the Market and from its existing auction reads. Outcomes are resolved from Market updates and fresh sale histories without extra observation requests. A dash means no settled observations are available; it does not mean a 0% sale rate. Observations stay in this browser, are limited to 20,000 listings with 35-day retention, and are excluded from backups.

## Updating from source

After pulling changes, run `pnpm install` and `pnpm build` from the repository. Reload KosMore at `chrome://extensions`, refresh existing Kosmora tabs, and reopen settings. Chrome must load the rebuilt `dist` folder; if your installed extension uses a separate folder, replace its contents with the new build first.
