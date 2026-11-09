import { button, el } from "../content/ui";
import { messageOf } from "../shared/types";
import {
  applyImport,
  backupFilename,
  createBackup,
  isBackupKey,
  MAX_BACKUP_FILE_BYTES,
  parseBackup,
  prepareImport,
  serializeBackup,
  type ImportMode,
  type KosMoreBackup,
  type PreparedImport,
} from "../shared/backup";

interface BackupActions {
  isDirty(): boolean;
  isBusy(): boolean;
  setApplying(applying: boolean): void;
  imported(): Promise<void>;
}
export class BackupSettings {
  readonly host = el("section", "panel backup-settings");
  private exportButton = button(
    "Export backup",
    () => void this.exportBackup(),
    "primary",
  );
  private file = el("input");
  private mode = el("select");
  private preview = el("section", "backup-preview");
  private summary = el("dl", "backup-summary");
  private impact = el("p", "notice backup-impact");
  private description = el("p", "sub");
  private confirmation = el("input");
  private confirmRow = el("label", "label backup-confirmation");
  private applyButton = button(
    "Import backup",
    () => void this.importBackup(),
    "primary",
  );
  private cancelButton = button(
    "Cancel",
    () => this.cancel(),
    "ghost settings-action",
  );
  private dirtyNotice = el("p", "notice");
  private status = el("p", "status");
  private backup?: KosMoreBackup;
  private prepared?: PreparedImport;
  private busy = false;
  private reading = false;
  private exporting = false;
  private generation = 0;
  private previewVersion = 0;
  constructor(private actions: BackupActions) {
    this.host.setAttribute("aria-label", "Backup & Restore");
    this.status.setAttribute("role", "status");
    this.status.setAttribute("aria-live", "polite");
    const content = el("div", "settings-group-content");
    this.host.append(el("h2", "", "Backup & Restore"), content);
    content.append(
      el(
        "p",
        "sub",
        "Move all saved KosMore preferences, pinned albums, friend families and notes, and card notes between browsers or computers. All saved accounts are included; no Kosmora tab is needed.",
      ),
      el("div", "rule"),
      el(
        "p",
        "notice",
        "Backups are readable JSON files containing your private notes. Keep them somewhere you trust. Unsaved edits are not exported.",
      ),
    );
    const exportActions = el("div", "backup-actions");
    exportActions.append(this.exportButton);
    content.append(exportActions, el("div", "rule"));
    const fileLabel = el("label", "", "Choose a backup JSON file");
    this.file.id = "backup-file";
    this.file.type = "file";
    this.file.accept = ".json,application/json";
    fileLabel.htmlFor = this.file.id;
    this.file.addEventListener("change", () => void this.readFile());
    this.mode.id = "backup-import-mode";
    const modeLabel = el("label", "", "Import mode");
    modeLabel.htmlFor = this.mode.id;
    for (const [value, text] of [
      ["merge", "Merge"],
      ["replace", "Replace"],
    ]) {
      const option = el("option", "", text);
      option.value = value;
      this.mode.append(option);
    }
    this.mode.addEventListener("change", () => {
      this.confirmation.checked = false;
      void this.refreshPreview().catch((error) =>
        this.setStatus(messageOf(error), true),
      );
    });
    this.confirmation.type = "checkbox";
    this.confirmation.addEventListener("change", () => this.refreshControls());
    this.confirmRow.append(
      this.confirmation,
      document.createTextNode(
        "Replace all saved KosMore settings and notes with this backup.",
      ),
    );
    const importActions = el("div", "backup-actions");
    importActions.append(this.cancelButton, this.applyButton);
    this.preview.setAttribute("aria-label", "Backup preview");
    this.preview.append(
      el("h3", "", "Backup preview"),
      this.summary,
      modeLabel,
      this.mode,
      this.description,
      this.impact,
      this.confirmRow,
      this.dirtyNotice,
      importActions,
    );
    this.preview.hidden = true;
    content.append(fileLabel, this.file, this.preview, this.status);
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !Object.keys(changes).some(isBackupKey)) return;
      if (this.backup && !this.busy) {
        this.confirmation.checked = false;
        void this.refreshPreview().catch((error) =>
          this.setStatus(messageOf(error), true),
        );
      }
      this.refreshControls();
    });
    this.refreshControls();
  }
  private setStatus(message: string, error = false) {
    this.status.className = error ? "status error" : "status";
    this.status.textContent = message;
  }
  refreshControls() {
    const locked = this.busy || this.actions.isBusy();
    this.exportButton.disabled = locked || this.reading || this.exporting;
    this.file.disabled = locked || this.reading;
    this.mode.disabled = locked || this.reading;
    this.confirmation.disabled = locked || this.reading;
    this.cancelButton.disabled = this.busy;
    const dirty = this.actions.isDirty();
    this.dirtyNotice.textContent = dirty
      ? "Save or cancel your unsaved settings changes before importing. Export includes saved values only."
      : "";
    this.applyButton.disabled =
      locked ||
      this.reading ||
      !this.prepared ||
      dirty ||
      (this.mode.value === "replace" && !this.confirmation.checked);
    this.host.setAttribute("aria-busy", String(this.busy || this.reading));
  }
  private cancel() {
    this.generation++;
    this.previewVersion++;
    this.reading = false;
    this.backup = undefined;
    this.prepared = undefined;
    this.preview.hidden = true;
    this.file.value = "";
    this.mode.value = "merge";
    this.confirmation.checked = false;
    this.setStatus("Import canceled. Saved data and unsaved edits were kept.");
    this.refreshControls();
  }
  private async readFile() {
    const file = this.file.files?.[0];
    if (!file) return;
    const generation = ++this.generation;
    this.previewVersion++;
    this.reading = true;
    this.backup = undefined;
    this.prepared = undefined;
    this.preview.hidden = true;
    this.mode.value = "merge";
    this.confirmation.checked = false;
    this.setStatus("Reading backup…");
    this.refreshControls();
    try {
      if (file.size > MAX_BACKUP_FILE_BYTES)
        throw new Error("Choose a backup smaller than 32 MiB.");
      const backup = parseBackup(await file.text());
      if (generation !== this.generation) return;
      this.backup = backup;
      await this.refreshPreview();
      if (generation === this.generation)
        this.setStatus(
          "Backup validated. Review the preview before importing.",
        );
    } catch (error) {
      if (generation === this.generation) {
        this.backup = undefined;
        this.prepared = undefined;
        this.preview.hidden = true;
        this.file.value = "";
        this.setStatus(messageOf(error), true);
      }
    } finally {
      if (generation === this.generation) this.reading = false;
      this.refreshControls();
    }
  }
  private async refreshPreview() {
    const backup = this.backup,
      version = ++this.previewVersion,
      previous = this.prepared;
    if (!backup) return;
    this.prepared = undefined;
    this.refreshControls();
    const prepared = prepareImport(
      backup,
      this.mode.value as ImportMode,
      await chrome.storage.local.get(null),
    );
    if (version !== this.previewVersion || this.backup !== backup) return;
    if (previous && previous.revision !== prepared.revision)
      this.confirmation.checked = false;
    this.prepared = prepared;
    const p = prepared.preview;
    this.summary.replaceChildren();
    for (const [label, value] of [
      ["Exported", new Date(backup.exportedAt).toLocaleString()],
      ["KosMore version", backup.extensionVersion],
      [
        "Accounts",
        p.accounts.length
          ? p.accounts.join(", ")
          : "No account-specific records",
      ],
      ["Pinned albums", String(p.pinnedAlbums)],
      ["Friend reminders", String(p.friends)],
      ["Card notes", String(p.cardNotes)],
    ])
      this.summary.append(el("dt", "", label), el("dd", "", value));
    this.impact.textContent = `${p.added} entries added · ${p.overwritten} overwritten · ${p.removed} removed · ${p.unchanged} unchanged. Entries include preferences, market filters, account pin lists, friend reminders, and card notes.`;
    const replace = prepared.mode === "replace";
    this.description.textContent = replace
      ? "Replace restores this backup's settings and notes. Existing entries absent from the backup will be removed. Export the current browser's backup first if you want to keep a copy."
      : "Merge uses backup preferences and matching notes. Entries absent from the backup are kept; matching notes and family lists are replaced, not combined. Pin order comes from the backup for each included account.";
    this.confirmRow.hidden = !replace;
    this.preview.hidden = false;
    this.refreshControls();
  }
  private async exportBackup() {
    if (this.busy || this.actions.isBusy() || this.exporting) return;
    this.exporting = true;
    this.refreshControls();
    try {
      const now = new Date();
      const backup = createBackup(
        await chrome.storage.local.get(null),
        chrome.runtime.getManifest().version,
        now,
      );
      const url = URL.createObjectURL(
        new Blob([serializeBackup(backup)], {
          type: "application/json;charset=utf-8",
        }),
      );
      const link = el("a");
      link.href = url;
      link.download = backupFilename(now);
      this.host.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      this.setStatus(
        "Backup downloaded. It contains saved values and readable private notes.",
      );
    } catch (error) {
      this.setStatus(`Could not export backup. ${messageOf(error)}`, true);
    } finally {
      this.exporting = false;
      this.refreshControls();
    }
  }
  private async importBackup() {
    if (
      !this.prepared ||
      this.busy ||
      this.actions.isBusy() ||
      this.actions.isDirty() ||
      (this.mode.value === "replace" && !this.confirmation.checked)
    )
      return;
    this.busy = true;
    this.previewVersion++;
    this.actions.setApplying(true);
    this.refreshControls();
    this.setStatus(
      "Importing backup… Keep other KosMore editors unchanged until it finishes.",
    );
    let applied = false;
    try {
      await applyImport(this.prepared);
      applied = true;
      await this.actions.imported();
      this.backup = undefined;
      this.prepared = undefined;
      this.preview.hidden = true;
      this.file.value = "";
      this.confirmation.checked = false;
      this.setStatus(
        "Backup imported. Settings and notes are saved in this browser and apply to open Kosmora tabs.",
      );
    } catch (error) {
      this.confirmation.checked = false;
      this.setStatus(
        applied
          ? `Backup imported, but the settings screen could not refresh. Reload this page. ${messageOf(error)}`
          : messageOf(error),
        true,
      );
      if (!applied)
        await this.refreshPreview().catch(() => {
          this.prepared = undefined;
        });
    } finally {
      this.busy = false;
      this.actions.setApplying(false);
      this.refreshControls();
    }
  }
}
