import { button, el } from "../content/ui";
import {
  NAVIGATION,
  shortcutFromEvent,
  shortcutLabel,
  type Hotkeys,
} from "../shared/hotkeys";

export class HotkeySettings {
  readonly host = el("section", "panel");
  private list = el("div", "hotkey-list");
  private hint = el("p", "sub");
  constructor(private change: (hotkeys: Hotkeys) => void) {
    this.hint.setAttribute("aria-live", "polite");
    this.host.append(
      el("h2", "", "Navigation Hotkeys"),
      el(
        "p",
        "sub",
        "Choose a shortcut, then press a letter, number, or F-key with optional Ctrl, Alt, Shift, or Meta. Escape cancels recording. Shortcuts work on Kosmora pages and pause while typing. Browser-reserved shortcuts may not reach KosMore.",
      ),
      this.list,
      this.hint,
    );
  }
  render(hotkeys: Hotkeys) {
    this.list.replaceChildren();
    this.hint.textContent = "";
    for (const item of NAVIGATION) {
      const row = el("div", "hotkey-row"),
        label = el("span", "hotkey-label", item.label),
        actions = el("div", "hotkey-actions");
      let recording = false;
      const record = button(
        shortcutLabel(hotkeys[item.id]),
        () => {
          recording = true;
          record.textContent = "Press shortcut…";
          record.setAttribute("aria-pressed", "true");
          this.hint.textContent = `Recording ${item.label}. Press Escape to cancel.`;
        },
        "ghost shortcut-record",
      );
      record.setAttribute("aria-label", `Set shortcut for ${item.label}`);
      record.setAttribute("aria-pressed", "false");
      record.addEventListener("blur", () => {
        recording = false;
        record.textContent = shortcutLabel(hotkeys[item.id]);
        record.setAttribute("aria-pressed", "false");
        this.hint.textContent = "";
      });
      record.addEventListener("keydown", (event) => {
        if (!recording || event.key === "Tab") return;
        event.preventDefault();
        event.stopPropagation();
        if (event.key === "Escape") {
          record.blur();
          return;
        }
        const shortcut = shortcutFromEvent(event);
        if (!shortcut) return;
        this.change({ ...hotkeys, [item.id]: shortcut });
        this.render({ ...hotkeys, [item.id]: shortcut });
        this.list
          .querySelector<HTMLButtonElement>(`[data-shortcut='${item.id}']`)
          ?.focus();
      });
      record.dataset.shortcut = item.id;
      const clear = button(
        "Clear",
        () => {
          const next = { ...hotkeys };
          delete next[item.id];
          this.change(next);
          this.render(next);
          this.list
            .querySelector<HTMLButtonElement>(`[data-shortcut='${item.id}']`)
            ?.focus();
        },
        "ghost small",
      );
      clear.setAttribute("aria-label", `Clear shortcut for ${item.label}`);
      clear.disabled = !hotkeys[item.id];
      actions.append(record, clear);
      row.append(label, actions);
      this.list.append(row);
    }
  }
}
