import {
  cardNoteKey,
  emptyCardNote,
  MAX_CARD_NOTE_LENGTH,
  parseCardNote,
  readCardNote,
  saveCardNote,
  type CardNote,
} from "../shared/card-notes";
import { messageOf, type Account, type KosmoraClient } from "../shared/types";
import { el, button, note } from "./ui";
export class CardNotes {
  private input = el("textarea");
  private fieldset = el("fieldset", "notes-editor");
  private status = el("p", "note notes-status", "Loading your account…");
  private saveButton = button("Save notes", () => void this.save());
  private cancelButton = button("Cancel notes", () => this.reset());
  private retryButton = button("Retry notes", () => this.refresh());
  private account?: Account;
  private key?: string;
  private saved = emptyCardNote();
  private active = false;
  private ready = false;
  private saving = false;
  private closed = false;
  private version = 0;
  private listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => {
    if (
      area !== "local" ||
      !this.key ||
      !changes[this.key] ||
      this.saving ||
      !this.active
    )
      return;
    this.version++;
    try {
      this.receive(parseCardNote(changes[this.key].newValue));
    } catch (error) {
      this.failed(error);
    }
  };
  constructor(
    panel: HTMLElement,
    private id: string,
    private client: Pick<KosmoraClient, "account">,
  ) {
    const label = el("label", "notes-label", "Card notes");
    label.htmlFor = "kosmore-card-note";
    this.input.id = "kosmore-card-note";
    this.input.rows = 6;
    this.input.maxLength = MAX_CARD_NOTE_LENGTH;
    this.input.placeholder = "Anything to remember about this card…";
    this.input.addEventListener("input", () => {
      this.status.textContent = this.dirty
        ? "Unsaved changes"
        : "Saved locally";
      this.status.classList.remove("error");
      this.controls();
    });
    const actions = el("div", "notes-actions");
    actions.append(this.saveButton, this.cancelButton);
    this.fieldset.append(label, this.input, actions);
    this.status.setAttribute("role", "status");
    this.retryButton.hidden = true;
    panel.append(
      note(
        "Private notes for this card, shared across its copies and variants. Saved only in this browser.",
      ),
      this.fieldset,
      this.status,
      this.retryButton,
    );
    chrome.storage.onChanged.addListener(this.listener);
    this.controls();
  }
  private get dirty() {
    return this.input.value !== this.saved.text;
  }
  setAccount(account: Account) {
    if (this.account?.key === account.key) return;
    this.version++;
    this.account = account;
    this.key = cardNoteKey(account.key, this.id);
    this.ready = false;
    this.saved = emptyCardNote();
    this.input.value = "";
    this.controls();
    if (this.active) void this.load();
  }
  activate() {
    this.active = true;
    if (!this.ready && this.account) void this.load();
  }
  refresh() {
    if (this.dirty) {
      this.failed(
        new Error("Save or Cancel your draft before refreshing notes."),
      );
      return;
    }
    void this.load();
  }
  failed(error: unknown) {
    this.status.textContent = messageOf(error);
    this.status.classList.add("error");
    this.retryButton.hidden = !this.account;
    this.controls();
  }
  dispose() {
    this.closed = true;
    this.version++;
    chrome.storage.onChanged.removeListener(this.listener);
  }
  private controls() {
    this.fieldset.disabled = !this.ready || this.saving;
    this.saveButton.disabled = !this.dirty;
    this.cancelButton.disabled = !this.dirty;
    this.retryButton.disabled = this.saving;
  }
  private reset() {
    this.input.value = this.saved.text;
    this.status.textContent = "Saved locally";
    this.status.classList.remove("error");
    this.retryButton.hidden = true;
    this.controls();
  }
  private receive(value: CardNote) {
    if (this.dirty) {
      this.saved = value;
      this.status.textContent =
        "Updated in another tab. Save to replace it, or Cancel to load it.";
      this.status.classList.remove("error");
      this.controls();
    } else {
      this.saved = value;
      this.ready = true;
      this.reset();
    }
  }
  private async load() {
    if (!this.key || this.closed) return;
    const version = ++this.version,
      key = this.key;
    this.ready = false;
    this.status.textContent = "Loading card notes…";
    this.status.classList.remove("error");
    this.retryButton.hidden = true;
    this.controls();
    try {
      const value = await readCardNote(key);
      if (!this.closed && this.version === version) {
        this.saved = value;
        this.ready = true;
        this.reset();
      }
    } catch (error) {
      if (!this.closed && this.version === version) this.failed(error);
    }
  }
  private async save() {
    if (!this.ready || this.saving || !this.account || !this.key) return;
    const value: CardNote = { schemaVersion: 1, text: this.input.value },
      key = this.key,
      accountKey = this.account.key;
    this.saving = true;
    this.status.textContent = "Saving locally…";
    this.controls();
    try {
      if ((await this.client.account()).key !== accountKey)
        throw new Error(
          "Your Kosmora account changed. Reopen the popup to save notes.",
        );
      await saveCardNote(key, value);
      this.saved = value;
      if (!this.closed) {
        this.status.textContent = "Saved locally";
        this.status.classList.remove("error");
        this.retryButton.hidden = true;
      }
    } catch (error) {
      if (!this.closed) this.failed(error);
    } finally {
      this.saving = false;
      if (!this.closed) this.controls();
    }
  }
}
