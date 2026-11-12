import { button, el } from "../content/ui";
import {
  shortcutFromEvent,
  shortcutLabel,
  type Hotkeys,
  type Shortcut,
  type ShortcutAction,
} from "../shared/hotkeys";

export function shortcutControls(
  id: string,
  label: string,
  shortcut: Shortcut | undefined,
  change: (shortcut: Shortcut | undefined) => void,
  hint: HTMLElement,
  pack = false,
) {
  const actions = el("div", "hotkey-actions");
  let recording = false;
  const record = button(
    shortcutLabel(shortcut),
    () => {
      recording = true;
      record.textContent = "Press shortcut…";
      record.setAttribute("aria-pressed", "true");
      hint.textContent = `Recording ${label}. Press Escape to cancel.`;
    },
    "ghost shortcut-record",
  );
  const clear = button(
    "Clear",
    () => {
      update(undefined);
      record.focus();
    },
    "ghost small",
  );
  function stopRecording() {
    recording = false;
    record.textContent = shortcutLabel(shortcut);
    record.setAttribute("aria-pressed", "false");
    hint.textContent = "";
  }
  function update(next: Shortcut | undefined) {
    shortcut = next;
    change(next);
    clear.disabled = !next;
    stopRecording();
  }
  record.dataset.shortcut = id;
  record.setAttribute("aria-label", `Set shortcut for ${label}`);
  record.setAttribute("aria-pressed", "false");
  record.addEventListener("blur", () => {
    if (recording) stopRecording();
  });
  record.addEventListener("keydown", (event) => {
    if (!recording || event.key === "Tab") return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") {
      record.blur();
      return;
    }
    const next = shortcutFromEvent(event, pack);
    if (next) update(next);
  });
  clear.setAttribute("aria-label", `Clear shortcut for ${label}`);
  clear.disabled = !shortcut;
  actions.append(record, clear);
  return actions;
}

export class HotkeySettings<Id extends string> {
  readonly host = el("section", "settings-subgroup");
  private list = el("div", "hotkey-list");
  private hint = el("p", "sub");
  constructor(
    title: string,
    private actions: readonly ShortcutAction<Id>[],
    private change: (hotkeys: Hotkeys<Id>) => void,
    private extendedKeys = false,
  ) {
    this.hint.setAttribute("aria-live", "polite");
    this.host.append(el("h3", "", title), this.list, this.hint);
  }
  render(hotkeys: Hotkeys<Id>) {
    this.list.replaceChildren();
    this.hint.textContent = "";
    for (const item of this.actions) {
      const row = el("div", "hotkey-row"),
        label = el("div", "hotkey-label", item.label);
      const actions = shortcutControls(
        item.id,
        item.label,
        hotkeys[item.id],
        (shortcut) => {
          const next = { ...hotkeys };
          if (shortcut) next[item.id] = shortcut;
          else delete next[item.id];
          hotkeys = next;
          this.change(next);
        },
        this.hint,
        this.extendedKeys,
      );
      if (item.help) {
        const help = el("p", "sub hotkey-help", item.help);
        help.id = `shortcut-help-${item.id}`;
        label.append(help);
        actions
          .querySelector(".shortcut-record")
          ?.setAttribute("aria-describedby", help.id);
      }
      row.append(label, actions);
      this.list.append(row);
    }
  }
}
