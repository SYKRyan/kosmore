## Install

1. Extract the tester ZIP to a permanent folder, such as `Documents\KosMore`.
2. In Chrome, open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the extracted folder containing `manifest.json`.
4. Open Kosmora and refresh any tabs that were already open.
5. Click KosMore in Chrome's Extensions menu to configure it. Save each settings group you change.

## Update

1. Extract the new ZIP and replace the files in the same folder used for your existing installation.
2. Open `chrome://extensions` and click **Reload** on KosMore. Keep the existing extension installed to preserve settings and notes.
3. Refresh your Kosmora tabs and reopen KosMore settings.

## Move settings to another browser or computer

Open **KosMore settings → Backup & restore → Export backup**. Save the JSON file, then open **Backup & restore** in the destination browser, choose that file, review the preview, and click **Import backup**. No signed-in Kosmora tab is required.

Backups include saved preferences, ordered pinned album shortcuts, market filters, friend families and notes, and card notes for all saved accounts. Unsaved edits and temporary per-tab pinning state are excluded. Notes remain associated with the original Kosmora account; sign into that account to use them.

**Merge** keeps destination-only entries and uses backup values for matching settings and notes. **Replace** removes existing supported entries absent from the backup and requires confirmation. Save or cancel unsaved settings edits before importing. Export a copy of the destination browser's data first if you want to keep it.

JSON backups contain readable private notes. Keep the file somewhere you trust.
