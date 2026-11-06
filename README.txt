Install
-------
1. Extract the release ZIP to a permanent folder, such as Documents\KosMore.
2. In Chrome, open chrome://extensions and turn on Developer mode.
3. Click Load unpacked and select the extracted folder containing manifest.json.
4. Open Kosmora and refresh any tabs that were already open.
5. Click KosMore in Chrome's Extensions menu to configure it.
   Save each settings group you change.

Update
------
1. Extract the new ZIP and replace the files in the same folder used for
   your existing installation.
2. Open chrome://extensions and click Reload on KosMore. Keep the existing
   extension installed to preserve settings and notes.
3. Refresh your Kosmora tabs and reopen KosMore settings.

Move settings to another browser or computer
-------------------------------------------
1. Open KosMore settings -> Backup & restore -> Export backup.
2. Transfer the JSON file to the destination computer or browser.
3. Install KosMore there, open Backup & restore, and choose the JSON file.
4. Review the preview, choose Merge or Replace, and click Import backup.
   Save or cancel unsaved settings edits before importing. Replace requires
   confirmation; export the destination's data first if you want to keep it.

Backups include saved preferences, ordered pinned album shortcuts, market
filters, friend families and notes, and card notes for every saved account.
Merge retains destination-only entries and uses imported values for matching
settings and notes. Replace removes supported entries absent from the backup.
Account associations are preserved. Sign into the same Kosmora account to use
its restored notes and shortcuts; import itself needs no signed-in game tab.

The JSON file contains readable private notes. Keep it somewhere you trust.
Unsaved edits and temporary per-tab pinning state are not exported.

See RELEASE-NOTES.md or RELEASE-NOTES.txt for the complete feature overview.
