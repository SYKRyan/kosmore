import { el, button } from "../content/ui";
import { statBox } from "../content/stat-box";
import {
  STAT_CATALOG,
  visibleStats,
  type StatPreference,
} from "../shared/stat-catalog";

export class StatSettings {
  readonly host = el("section", "panel stat-settings");
  private preview = el("div", "metrics stat-preview");
  private choices = el("ol", "stat-choices");
  constructor(private change: (preferences: StatPreference[]) => void) {
    const heading = el("h2", "", "Tooltip Stat Boxes");
    this.preview.setAttribute("role", "group");
    this.preview.setAttribute("aria-label", "Stat box preview");
    this.choices.setAttribute("aria-label", "Stat box visibility and order");
    this.host.append(
      heading,
      el(
        "p",
        "sub",
        "Choose which boxes appear and move them into your preferred order. Preview uses example values.",
      ),
      this.preview,
      this.choices,
    );
  }
  render(preferences: StatPreference[], collectSaleRateData = true) {
    const disabledBadge = () => el("span", "settings-group-state", "Disabled");
    const definitions = visibleStats(preferences);
    this.preview.replaceChildren(
      ...definitions.map((d) => {
        const preview = statBox(d, d.preview);
        if (d.id === "saleRate" && !collectSaleRateData)
          preview.append(disabledBadge());
        return preview;
      }),
    );
    if (!definitions.length)
      this.preview.append(el("p", "empty", "No stat boxes selected."));
    this.choices.replaceChildren(
      ...preferences.map((preference, index) => {
        const definition = STAT_CATALOG.find((d) => d.id === preference.id)!;
        const row = el("li", "stat-choice"),
          label = el("label", "label"),
          check = el("input"),
          info = el("span", "stat-info");
        check.type = "checkbox";
        check.checked = preference.enabled;
        check.dataset.control = `show-${definition.id}`;
        check.setAttribute("aria-label", `Show ${definition.label}`);
        const name = el("span", "", definition.label);
        if (definition.id === "saleRate" && !collectSaleRateData)
          name.append(" ", disabledBadge());
        info.append(name, el("span", "sub", definition.description));
        label.append(check, info);
        check.addEventListener("change", () => {
          this.change(
            preferences.map((p) =>
              p.id === preference.id ? { ...p, enabled: check.checked } : p,
            ),
          );
          this.restoreFocus(check.dataset.control!);
        });
        const actions = el("div", "album-actions");
        for (const [delta, glyph, name] of [
          [-1, "↑", "Move up"],
          [1, "↓", "Move down"],
        ] as const) {
          const move = button(
            glyph,
            () => {
              const next = [...preferences];
              [next[index], next[index + delta]] = [
                next[index + delta],
                next[index],
              ];
              this.change(next);
              this.restoreFocus(
                `${name}-${definition.id}`,
                `show-${definition.id}`,
              );
            },
            "small ghost",
          );
          move.dataset.control = `${name}-${definition.id}`;
          move.setAttribute("aria-label", `${name} ${definition.label} stat`);
          move.disabled =
            index + delta < 0 || index + delta >= preferences.length;
          actions.append(move);
        }
        row.append(label, actions);
        return row;
      }),
    );
  }
  private restoreFocus(control: string, fallback?: string) {
    const controls = [
      ...this.host.querySelectorAll<HTMLInputElement | HTMLButtonElement>(
        "[data-control]",
      ),
    ];
    const target =
      controls.find((e) => e.dataset.control === control && !e.disabled) ??
      controls.find((e) => e.dataset.control === fallback);
    target?.focus({ preventScroll: true });
  }
}
