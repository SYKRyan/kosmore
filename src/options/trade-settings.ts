import { el } from "../content/ui";
import type { Settings } from "../shared/types";

export const TRADE_NOTES_NUMBERS = [
  [
    "tradeNotesHoverDelayMs",
    "Notes hover delay",
    "Milliseconds before hovering or focusing opens notes (100–2,000). Tapping opens immediately.",
    100,
    2000,
    50,
  ],
  [
    "tradeNotesDismissDelayMs",
    "Notes dismiss delay",
    "Milliseconds after leaving the badge and tooltip (0–30,000). Pinned notes stay visible below the badges.",
    0,
    30000,
    50,
  ],
  [
    "tradeNotesWidth",
    "Notes tooltip width",
    "Width in pixels (240–1,200), limited to fit your screen.",
    240,
    1200,
    10,
  ],
  [
    "tradeNotesHeight",
    "Notes tooltip height",
    "Height in pixels (120–1,600), limited to fit your screen. Long notes scroll inside the tooltip.",
    120,
    1600,
    10,
  ],
] as const;
const TRADE_TOGGLES = [
  "tradeRemindersEnabled",
  "showTradeFamilyBadges",
  "showTradePossibleInterest",
  "tradeRaritySymbols",
  "showTradeNotes",
  "tradeNotesPinned",
] as const;
export const TRADE_SETTINGS_KEYS = [
  ...TRADE_TOGGLES,
  ...TRADE_NOTES_NUMBERS.map(([field]) => field),
] as const;
export class TradeSettings {
  readonly host = el("section", "panel");
  readonly inputs: {
    field: (typeof TRADE_TOGGLES)[number];
    input: HTMLInputElement;
  }[] = [];
  readonly numberInputs: {
    field: (typeof TRADE_NOTES_NUMBERS)[number][0];
    input: HTMLInputElement;
  }[] = [];
  constructor(change: (update: Partial<Settings>) => void) {
    this.host.append(
      el("h2", "", "Trade Reminders"),
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
      [
        "showTradeNotes",
        "Show saved notes badge",
        "Show Notes after the saved family badges when this player has notes. Tap, hover, or focus to read them.",
      ],
      [
        "tradeNotesPinned",
        "Pin trade notes below family badges",
        "Always show saved notes as a read-only block above Possible Interest. You can also pin or unpin from the notes header.",
      ],
    ] as const) {
      const nested =
        field === "tradeRaritySymbols" || field === "tradeNotesPinned";
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
    for (const [field, title, help, min, max, step] of TRADE_NOTES_NUMBERS) {
      const row = el("div", "row settings-subsetting"),
        info = el("div"),
        label = el("label", "", title),
        input = el("input");
      input.id = field;
      input.type = "number";
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      label.htmlFor = field;
      info.append(label, el("p", "sub", help));
      row.append(info, input);
      this.host.append(row);
      input.addEventListener("input", () =>
        change({ [field]: input.value === "" ? NaN : Number(input.value) }),
      );
      this.numberInputs.push({ field, input });
    }
  }
  private dependencies() {
    this.inputs.find((i) => i.field === "tradeRaritySymbols")!.input.disabled =
      !this.inputs.find((i) => i.field === "showTradePossibleInterest")!.input
        .checked;
    const notes = this.inputs.find((i) => i.field === "showTradeNotes")!.input
      .checked;
    this.inputs.find((i) => i.field === "tradeNotesPinned")!.input.disabled =
      !notes;
    for (const { input } of this.numberInputs) input.disabled = !notes;
  }
  render(settings: Settings) {
    for (const { field, input } of this.inputs) input.checked = settings[field];
    for (const { field, input } of this.numberInputs)
      input.value = String(settings[field]);
    this.dependencies();
  }
  validate(settings: Settings) {
    for (const [field, title, , min, max] of TRADE_NOTES_NUMBERS)
      if (
        !Number.isInteger(settings[field]) ||
        settings[field] < min ||
        settings[field] > max
      ) {
        this.numberInputs.find((item) => item.field === field)!.input.focus();
        return `Choose a ${title.toLowerCase()} from ${min.toLocaleString()} to ${max.toLocaleString()}.`;
      }
  }
}
