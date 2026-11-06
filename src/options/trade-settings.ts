import { el } from "../content/ui";
import type { Settings } from "../shared/types";

export const TRADE_SETTINGS_KEYS = [
  "tradeRemindersEnabled",
  "showTradeFamilyBadges",
  "showTradePossibleInterest",
  "tradeRaritySymbols",
] as const;
export class TradeSettings {
  readonly host = el("section", "panel");
  readonly inputs: {
    field: (typeof TRADE_SETTINGS_KEYS)[number];
    input: HTMLInputElement;
  }[] = [];
  constructor(change: (update: Partial<Settings>) => void) {
    this.host.append(
      el("h2", "", "Trade reminders"),
      el(
        "p",
        "sub",
        "Use the families saved in Social or Profile when proposing a trade. These reminders work independently of card hover tooltips.",
      ),
    );
    for (const [field, title, help] of [
      [
        "showTradeFamilyBadges",
        "Show preferred family badges",
        "Show the selected player's saved families above Possible Interest on Their card and Your card, and below the steps on other trade screens.",
      ],
      [
        "showTradePossibleInterest",
        "Show possible interest counts",
        "On Their card and Your card, count your available copies matching any saved family by rarity. Locked cards and cards for sale are excluded. Includes shiny and full art copies; overlapping families count each copy once. Zero counts stay hidden.",
      ],
      [
        "tradeRaritySymbols",
        "Use rarity symbols",
        "Use Kosmora's rarity gems in the counts. Turn off to show rarity names instead.",
      ],
    ] as const) {
      const nested = field === "tradeRaritySymbols";
      const input = el("input"),
        label = el("label", "label settings-toggle", title),
        row = el("div", `row${nested ? " settings-subsetting" : ""}`);
      input.id = field;
      input.type = "checkbox";
      if (nested) {
        input.classList.add("section-switch");
        input.setAttribute("role", "switch");
      }
      label.prepend(input);
      row.append(label, el("span", "hint", help));
      if (!nested) this.host.append(el("div", "rule"));
      this.host.append(row);
      input.addEventListener("change", () => {
        change({ [field]: input.checked });
        this.dependencies();
      });
      this.inputs.push({ field, input });
    }
  }
  private dependencies() {
    this.inputs.find((i) => i.field === "tradeRaritySymbols")!.input.disabled =
      !this.inputs.find((i) => i.field === "showTradePossibleInterest")!.input
        .checked;
  }
  render(settings: Settings) {
    for (const { field, input } of this.inputs) input.checked = settings[field];
    this.dependencies();
  }
}
