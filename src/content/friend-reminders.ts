import css from "./friend-reminders.css?inline";
import { el, button } from "./ui";
import { FRIEND_REMINDERS_ID } from "../kosmora/social";
import {
  normalizeFamilyTokens,
  emptyFriendReminder,
  MAX_NOTES_LENGTH,
  type FriendReminder,
} from "../shared/friend-reminders";
import { messageOf } from "../shared/types";
import {
  foldFamilyName,
  matchFamily,
  type FamilyChoice,
} from "../kosmora/families";

export class FriendReminders {
  readonly host = el("div");
  private fieldset = el("fieldset");
  private notes = el("textarea");
  private input = el("input");
  private tokens = el("ul", "tokens");
  private options = el("ul", "family-options");
  private familyHint = el("p", "hint", "Loading Kosmora's family list…");
  private addButton = button("Add", () => this.commitFamily());
  private retryButton: HTMLButtonElement;
  private choices?: FamilyChoice[];
  private matches: FamilyChoice[] = [];
  private activeOption = -1;
  private optionsOpen = false;
  private status = el("p", "status", "Loading your reminders…");
  private saveButton = button(
    "Save reminders",
    () => void this.save(),
    "primary",
  );
  private cancelButton = button("Cancel", () => this.reset());
  private families: string[] = [];
  private saved = emptyFriendReminder();
  private ready = false;
  private saving = false;
  private closed = false;
  private layoutObserver?: ResizeObserver;
  constructor(
    handle: string,
    private persist: (value: FriendReminder) => Promise<void>,
    retryFamilies: () => void,
    options?: { profile: boolean; controls: HTMLElement[] },
  ) {
    this.retryButton = button(
      "Retry families",
      retryFamilies,
      "retry-families",
    );
    this.retryButton.hidden = true;
    this.host.id = options?.profile
      ? "kosmore-profile-reminders"
      : FRIEND_REMINDERS_ID;
    if (options?.profile) this.host.dataset.kosmoreProfile = "editor";
    const shadow = this.host.attachShadow({ mode: "open" });
    const style = el("style");
    style.textContent = css;
    const content = el("section", "content");
    content.setAttribute("aria-label", `Private reminders for ${handle}`);
    content.append(
      el("p", "brand", "✦ KosMore · Private reminders"),
      el("h2", "", handle),
    );
    if (options?.profile) {
      content.querySelector(".brand")!.textContent = "✦ KosMore";
      content.querySelector("h2")!.remove();
      const actions = el("div", "header-actions");
      actions.append(...options.controls);
      content.prepend(actions);
    }
    const notesSection = el("div", "section notes-section");
    const notesTitle = el("h3");
    const notesLabel = el("label", "", "Notes");
    notesLabel.htmlFor = "friend-notes";
    notesTitle.append(notesLabel);
    this.notes.id = "friend-notes";
    this.notes.rows = 4;
    this.notes.maxLength = MAX_NOTES_LENGTH;
    this.notes.placeholder =
      "Trading preferences, ideas for gifts, or anything to remember…";
    this.notes.addEventListener("input", () => this.changed());
    notesSection.append(notesTitle, this.notes);
    const familySection = el("div", "section families-section");
    const familyTitle = el("h3");
    const familyLabel = el("label", "", "Families they like");
    familyLabel.htmlFor = "friend-family";
    familyTitle.append(familyLabel);
    const editor = el("div", "token-editor");
    const picker = el("div", "family-picker");
    this.tokens.setAttribute("aria-label", "Preferred families");
    this.input.id = "friend-family";
    this.input.placeholder = "Search Kosmora families…";
    this.input.autocomplete = "off";
    this.input.setAttribute("aria-describedby", "family-hint");
    this.input.setAttribute("role", "combobox");
    this.input.setAttribute("aria-autocomplete", "list");
    this.input.setAttribute("aria-controls", "family-options");
    this.options.id = "family-options";
    this.options.setAttribute("role", "listbox");
    this.options.setAttribute("aria-label", "Kosmora families");
    this.input.addEventListener("input", () => {
      this.activeOption = -1;
      this.optionsOpen = true;
      this.renderOptions();
      this.changed();
    });
    this.input.addEventListener("focus", () => {
      this.optionsOpen = true;
      this.renderOptions();
    });
    this.input.addEventListener("blur", () => {
      this.optionsOpen = false;
      this.renderOptions();
    });
    this.input.addEventListener("keydown", (e) => {
      if (e.isComposing) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        this.optionsOpen = true;
        this.activeOption =
          e.key === "ArrowDown"
            ? Math.min(this.matches.length - 1, this.activeOption + 1)
            : Math.max(0, this.activeOption - 1);
        this.renderOptions();
        this.options.children[this.activeOption]?.scrollIntoView({
          block: "nearest",
        });
      } else if (e.key === "Escape") {
        e.preventDefault();
        this.optionsOpen = false;
        this.renderOptions();
      } else if (e.key === "Enter") {
        e.preventDefault();
        const picked = this.optionsOpen
          ? this.matches[this.activeOption]
          : undefined;
        if (picked) this.pickFamily(picked);
        else this.commitFamily();
      }
      if (e.key === "Backspace" && !this.input.value && this.families.length) {
        this.families.pop();
        this.renderTokens();
        this.renderOptions();
        this.changed();
      }
    });
    editor.append(this.tokens, this.input);
    picker.append(editor, this.options);
    this.familyHint.id = "family-hint";
    this.familyHint.setAttribute("aria-live", "polite");
    const familyActions = el("div", "family-actions");
    familyActions.append(this.addButton);
    familySection.append(
      familyTitle,
      picker,
      this.familyHint,
      this.retryButton,
      familyActions,
    );
    const footer = el("div", "footer");
    this.status.setAttribute("role", "status");
    const actions = el("div", "footer-actions");
    actions.append(this.cancelButton, this.saveButton);
    footer.append(this.status, actions);
    this.fieldset.append(familySection, notesSection, footer);
    content.append(this.fieldset);
    shadow.append(style, content);
    if (options?.profile) {
      this.layoutObserver = new ResizeObserver(() => {
        this.notes.style.height =
          this.host.dataset.mode === "widget" && this.host.clientWidth >= 650
            ? `${editor.getBoundingClientRect().height}px`
            : "";
      });
      this.layoutObserver.observe(editor);
      this.layoutObserver.observe(this.host);
    }
    // Prevent the game's delegated keyboard and pointer actions from using editor input.
    for (const event of [
      "click",
      "pointerdown",
      "pointerup",
      "keydown",
      "keyup",
      "input",
      "change",
    ])
      this.host.addEventListener(event, (e) => e.stopPropagation());
    this.controls();
  }
  get dirty() {
    return (
      this.notes.value !== this.saved.notes ||
      JSON.stringify(this.families) !== JSON.stringify(this.saved.families) ||
      !!this.input.value.trim()
    );
  }
  loadingFamilies() {
    this.choices = undefined;
    this.retryButton.hidden = true;
    this.familyHint.textContent = "Loading Kosmora's family list…";
    this.familyHint.hidden = false;
    this.familyHint.classList.remove("error");
    this.renderOptions();
    this.controls();
  }
  setFamilyChoices(choices: FamilyChoice[]) {
    this.choices = choices;
    this.familyHint.textContent = choices.length
      ? ""
      : "Kosmora returned no families. Try refreshing the list.";
    this.familyHint.hidden = choices.length > 0;
    this.familyHint.classList.remove("error");
    this.retryButton.hidden = choices.length > 0;
    this.renderTokens();
    this.renderOptions();
    this.controls();
  }
  familiesFailed(error: unknown) {
    this.choices = undefined;
    this.familyHint.hidden = false;
    this.familyHint.textContent = `Family list unavailable: ${messageOf(error)} Your saved families and notes are still available.`;
    this.familyHint.classList.add("error");
    this.retryButton.hidden = false;
    this.renderOptions();
    this.controls();
  }
  load(value: FriendReminder) {
    this.saved = structuredClone(value);
    this.ready = true;
    this.reset();
  }
  failed(error: unknown) {
    this.status.textContent = messageOf(error);
    this.status.classList.add("error");
    this.controls();
  }
  receive(value: FriendReminder) {
    if (this.saving || JSON.stringify(this.saved) === JSON.stringify(value))
      return;
    if (this.dirty) {
      this.saved = structuredClone(value);
      this.status.textContent =
        "Updated in another tab. Save to replace it, or Cancel to load it.";
      this.status.classList.remove("error");
      this.controls();
    } else this.load(value);
  }
  dispose() {
    this.closed = true;
    this.layoutObserver?.disconnect();
    this.host.remove();
  }
  private controls() {
    this.fieldset.disabled = !this.ready || this.saving;
    this.saveButton.disabled = !this.dirty;
    this.cancelButton.disabled = !this.dirty;
    this.input.disabled = !this.choices?.length;
    this.addButton.disabled = !this.choices?.length;
  }
  private changed() {
    this.status.textContent = this.dirty ? "Unsaved changes" : "Saved locally";
    this.status.classList.remove("error");
    this.controls();
  }
  private reset() {
    this.notes.value = this.saved.notes;
    this.families = [...this.saved.families];
    this.input.value = "";
    this.renderTokens();
    this.activeOption = -1;
    this.optionsOpen = false;
    this.renderOptions();
    this.changed();
  }
  private renderTokens() {
    this.tokens.replaceChildren(
      ...this.families.map((family) => {
        const token = el("li", "token");
        if (this.choices && !matchFamily(this.choices, family))
          token.title =
            "Previously saved family; not found in the current game list.";
        const remove = button("×", () => {
          this.families = this.families.filter((f) => f !== family);
          this.renderTokens();
          this.renderOptions();
          this.changed();
          this.input.focus();
          this.optionsOpen = false;
          this.renderOptions();
        });
        remove.setAttribute("aria-label", `Remove family ${family}`);
        token.append(el("span", "", family), remove);
        return token;
      }),
    );
  }
  private commitFamily(): boolean {
    if (!this.input.value.trim()) return true;
    try {
      const family =
        this.choices && matchFamily(this.choices, this.input.value);
      if (!family)
        throw new Error("Choose a valid family from Kosmora's list.");
      return this.pickFamily(family);
    } catch (error) {
      this.failed(error);
      return false;
    }
  }
  private pickFamily(family: FamilyChoice): boolean {
    try {
      this.families = normalizeFamilyTokens([...this.families, family.name]);
      this.input.value = "";
      this.renderTokens();
      this.changed();
      this.input.focus();
      this.activeOption = -1;
      this.optionsOpen = false;
      this.renderOptions();
      return true;
    } catch (error) {
      this.failed(error);
      return false;
    }
  }
  private renderOptions() {
    const query = foldFamilyName(this.input.value);
    this.matches = (this.choices ?? [])
      .filter(
        (f) =>
          !this.families.some(
            (name) => foldFamilyName(name) === foldFamilyName(f.name),
          ) && foldFamilyName(f.name).includes(query),
      )
      .sort(
        (a, b) =>
          Number(foldFamilyName(b.name).startsWith(query)) -
            Number(foldFamilyName(a.name).startsWith(query)) ||
          a.name.localeCompare(b.name),
      )
      .slice(0, 20);
    if (this.activeOption >= this.matches.length) this.activeOption = -1;
    const open = this.optionsOpen && !!this.choices?.length;
    this.options.hidden = !open;
    this.input.setAttribute("aria-expanded", String(open));
    this.input.removeAttribute("aria-activedescendant");
    this.options.replaceChildren(
      ...this.matches.map((family, index) => {
        const option = el("li", index === this.activeOption ? "active" : "");
        option.id = `family-choice-${index}`;
        option.setAttribute("role", "option");
        option.setAttribute(
          "aria-selected",
          String(index === this.activeOption),
        );
        option.setAttribute(
          "aria-label",
          `${family.name} · ${family.domainName}`,
        );
        option.append(
          el("span", "", family.name),
          el("small", "", family.domainName),
        );
        option.addEventListener("mousedown", (e) => e.preventDefault());
        option.addEventListener("click", () => this.pickFamily(family));
        if (open && index === this.activeOption)
          this.input.setAttribute("aria-activedescendant", option.id);
        return option;
      }),
    );
    if (!this.matches.length)
      this.options.append(el("li", "empty", "No matching families."));
  }
  private async save() {
    if (!this.ready || this.saving || !this.commitFamily()) return;
    const value: FriendReminder = {
      schemaVersion: 1,
      notes: this.notes.value,
      families: [...this.families],
    };
    this.saving = true;
    this.status.textContent = "Saving locally…";
    this.controls();
    try {
      await this.persist(value);
      this.saved = value;
      if (!this.closed) this.status.textContent = "Saved locally";
    } catch (error) {
      if (!this.closed) this.failed(error);
    } finally {
      this.saving = false;
      if (!this.closed) this.controls();
    }
  }
}
