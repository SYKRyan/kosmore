import { button, el } from "../content/ui";
import {
  foldFamilyName,
  matchFamily,
  type FamilyChoice,
} from "../kosmora/families";
import { normalizeFamilyTokens } from "../shared/friend-reminders";
import { messageOf, type Settings } from "../shared/types";

/** The same searchable tokens and keyboard interactions as friend interests. */
export class FamilyBlacklistSettings {
  readonly host = el("fieldset", "settings-subgroup family-blacklist");
  private enabled = el("input");
  private fields = el("fieldset", "blacklist-fields");
  private input = el("input");
  private tokens = el("ul", "tokens");
  private options = el("ul", "family-options");
  private hint = el("p", "hint");
  private problem = el("p", "hint error");
  private add = button("Add", () => this.commit(), "small");
  private retry = button(
    "Retry families",
    () => void this.load(true),
    "small ghost",
  );
  private families: string[] = [];
  private choices?: FamilyChoice[];
  private loading = false;
  private attempted = false;
  private matches: FamilyChoice[] = [];
  private active = -1;
  private open = false;

  constructor(
    private change: (update: Partial<Settings>) => void,
    private loadChoices: () => Promise<FamilyChoice[]>,
  ) {
    this.enabled.type = "checkbox";
    const toggle = el("label", "label settings-toggle", "Use Family Blacklist");
    toggle.prepend(this.enabled);
    this.host.append(
      el("legend", "", "Blacklist"),
      toggle,
      el(
        "p",
        "sub",
        "Replace an otherwise Safe badge with a red Blacklist tag when the card belongs to one of these families. Tier-loss warnings keep their normal labels.",
      ),
    );
    const label = el("label", "label", "Blacklisted Families");
    this.input.id = "blacklist-family";
    label.htmlFor = this.input.id;
    this.input.placeholder = "Search Kosmora families…";
    this.input.autocomplete = "off";
    this.input.setAttribute("role", "combobox");
    this.input.setAttribute("aria-autocomplete", "list");
    this.input.setAttribute("aria-controls", "blacklist-family-options");
    this.options.id = "blacklist-family-options";
    this.options.setAttribute("role", "listbox");
    this.options.setAttribute("aria-label", "Kosmora families for blacklist");
    this.tokens.setAttribute("aria-label", "Blacklisted families");
    this.problem.setAttribute("role", "alert");
    this.problem.hidden = this.retry.hidden = true;
    const editor = el("div", "token-editor"),
      picker = el("div", "family-picker"),
      row = el("div", "blacklist-picker-row");
    editor.append(this.tokens, this.input);
    picker.append(editor, this.options);
    row.append(picker, this.add);
    this.fields.append(label, row, this.hint, this.retry, this.problem);
    this.host.append(this.fields);
    this.enabled.addEventListener("change", () => {
      this.change({ useFamilyBlacklist: this.enabled.checked });
      this.fields.disabled = !this.enabled.checked;
      if (this.enabled.checked) void this.load();
      this.renderOptions();
    });
    this.input.addEventListener("input", () => {
      this.problem.hidden = true;
      this.active = -1;
      this.open = true;
      this.renderOptions();
    });
    this.input.addEventListener("focus", () => {
      this.open = true;
      void this.load();
      this.renderOptions();
    });
    this.input.addEventListener("blur", () => {
      this.open = false;
      this.renderOptions();
    });
    this.input.addEventListener("keydown", (event) => {
      if (event.isComposing) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        this.open = true;
        this.active =
          event.key === "ArrowDown"
            ? Math.min(this.matches.length - 1, this.active + 1)
            : Math.max(0, this.active - 1);
        this.renderOptions();
        this.options.children[this.active]?.scrollIntoView({
          block: "nearest",
        });
      } else if (event.key === "Escape") {
        event.preventDefault();
        this.open = false;
        this.renderOptions();
      } else if (event.key === "Enter") {
        event.preventDefault();
        const choice = this.open ? this.matches[this.active] : undefined;
        if (choice) this.pick(choice);
        else this.commit();
      } else if (
        event.key === "Backspace" &&
        !this.input.value &&
        this.families.length
      ) {
        this.update(this.families.slice(0, -1));
      }
    });
  }

  get pendingInput() {
    return !!this.input.value.trim();
  }
  resetInput() {
    this.input.value = "";
    this.problem.hidden = true;
    this.open = false;
    this.renderOptions();
  }
  render(settings: Settings) {
    this.enabled.checked = settings.useFamilyBlacklist;
    this.fields.disabled = !settings.useFamilyBlacklist;
    this.families = [...settings.familyBlacklist];
    this.renderTokens();
    this.renderOptions();
    if (settings.useFamilyBlacklist && settings.familyImpactOverlaysEnabled)
      void this.load();
  }
  validate(settings: Settings): string | undefined {
    if (settings.useFamilyBlacklist && !this.commit()) {
      this.input.focus();
      return this.problem.textContent ?? "Choose a valid family.";
    }
  }
  private async load(retry = false) {
    if (this.choices || this.loading || (this.attempted && !retry)) return;
    this.attempted = true;
    this.loading = true;
    this.retry.hidden = true;
    this.hint.textContent = "Loading Kosmora's family list…";
    this.add.disabled = true;
    try {
      this.choices = await this.loadChoices();
      this.hint.textContent = this.choices.length
        ? ""
        : "Kosmora returned no families. Try refreshing the list.";
      this.retry.hidden = !!this.choices.length;
      if (!this.choices.length) this.choices = undefined;
    } catch (error) {
      this.hint.textContent = `Family list unavailable: ${messageOf(error)} Saved tokens are still available.`;
      this.retry.hidden = false;
    } finally {
      this.loading = false;
      this.add.disabled = !this.choices?.length;
      this.renderOptions();
    }
  }
  private update(families: string[]) {
    this.families = families;
    this.change({ familyBlacklist: [...families] });
    this.renderTokens();
    this.renderOptions();
  }
  private commit(): boolean {
    if (!this.pendingInput) return true;
    const choice = this.choices && matchFamily(this.choices, this.input.value);
    if (choice) return this.pick(choice);
    this.problem.textContent = "Choose a valid family from Kosmora's list.";
    this.problem.hidden = false;
    return false;
  }
  private pick(choice: FamilyChoice): boolean {
    try {
      this.update(
        normalizeFamilyTokens(
          [...this.families, choice.name],
          "in the family blacklist",
        ),
      );
      this.resetInput();
      this.input.focus();
      this.open = false;
      this.renderOptions();
      return true;
    } catch (error) {
      this.problem.textContent = messageOf(error);
      this.problem.hidden = false;
      return false;
    }
  }
  private renderTokens() {
    this.tokens.replaceChildren(
      ...this.families.map((family) => {
        const token = el("li", "token"),
          remove = button("×", () => {
            this.update(this.families.filter((name) => name !== family));
            this.input.focus();
            this.open = false;
            this.renderOptions();
          });
        remove.setAttribute("aria-label", `Remove family ${family}`);
        token.append(el("span", "", family), remove);
        return token;
      }),
    );
  }
  private renderOptions() {
    const query = foldFamilyName(this.input.value);
    this.matches = (this.choices ?? [])
      .filter(
        (family) =>
          !this.families.some(
            (name) => foldFamilyName(name) === foldFamilyName(family.name),
          ) && foldFamilyName(family.name).includes(query),
      )
      .sort(
        (a, b) =>
          Number(foldFamilyName(b.name).startsWith(query)) -
            Number(foldFamilyName(a.name).startsWith(query)) ||
          a.name.localeCompare(b.name),
      )
      .slice(0, 20);
    if (this.active >= this.matches.length) this.active = -1;
    const open =
      this.open && !!this.choices?.length && !this.input.matches(":disabled");
    this.options.hidden = !open;
    this.input.setAttribute("aria-expanded", String(open));
    this.input.removeAttribute("aria-activedescendant");
    this.options.replaceChildren(
      ...this.matches.map((family, index) => {
        const option = el("li", index === this.active ? "active" : "");
        option.id = `blacklist-family-choice-${index}`;
        option.setAttribute("role", "option");
        option.setAttribute("aria-selected", String(index === this.active));
        option.setAttribute(
          "aria-label",
          `${family.name} · ${family.domainName}`,
        );
        option.append(
          el("span", "", family.name),
          el("small", "", family.domainName),
        );
        option.addEventListener("mousedown", (event) => event.preventDefault());
        option.addEventListener("click", () => this.pick(family));
        if (open && this.active === index)
          this.input.setAttribute("aria-activedescendant", option.id);
        return option;
      }),
    );
    if (!this.matches.length)
      this.options.append(el("li", "empty", "No matching families."));
  }
}
