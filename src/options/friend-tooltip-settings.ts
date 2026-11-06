import { el } from "../content/ui";
import type { Settings } from "../shared/types";

export const FRIEND_TOOLTIP_NUMBERS = [
  [
    "friendHoverDelayMs",
    "Friend hover delay",
    "Milliseconds before the friend tooltip opens (100–2,000).",
    100,
    2000,
    50,
  ],
  [
    "friendDismissDelayMs",
    "Friend dismiss delay",
    "Milliseconds after leaving the icon and friend tooltip (0–30,000). Pinned friend tooltips stay open.",
    0,
    30000,
    50,
  ],
  [
    "friendTooltipWidth",
    "Friend tooltip width",
    "Width in pixels (240–1,200), limited to fit your screen.",
    240,
    1200,
    10,
  ],
  [
    "friendTooltipHeight",
    "Friend tooltip height",
    "Height in pixels (160–1,600), limited to fit your screen. Long friend details scroll inside the tooltip.",
    160,
    1600,
    10,
  ],
] as const;
export const FRIEND_TOOLTIP_KEYS = [
  "friendTooltipEnabled",
  ...FRIEND_TOOLTIP_NUMBERS.map(([field]) => field),
] as const;
export class FriendTooltipSettings {
  readonly host = el("section", "panel");
  readonly inputs: {
    field: (typeof FRIEND_TOOLTIP_NUMBERS)[number][0];
    input: HTMLInputElement;
  }[] = [];
  constructor(change: (update: Partial<Settings>) => void) {
    this.host.append(
      el("h2", "", "Friend tooltip"),
      el(
        "p",
        "sub",
        "Hover or focus the friend indicator inside the card hover tooltip to see matching friends. Click a friend to expand all saved families and notes, then open Social or Profile. Only one friend expands at a time. Pin, drag, and resize this smaller tooltip independently of the card tooltip.",
      ),
    );
    for (const [field, title, help, min, max, step] of FRIEND_TOOLTIP_NUMBERS) {
      const row = el("div", "row"),
        info = el("div"),
        label = el("label", "", title),
        input = el("input");
      input.id = field;
      input.type = "number";
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      label.htmlFor = input.id;
      info.append(label, el("p", "sub", help));
      row.append(info, input);
      this.host.append(el("div", "rule"), row);
      input.addEventListener("input", () =>
        change({ [field]: input.value === "" ? NaN : Number(input.value) }),
      );
      this.inputs.push({ field, input });
    }
  }
  render(settings: Settings) {
    for (const { field, input } of this.inputs)
      input.value = String(settings[field]);
  }
  validate(settings: Settings) {
    for (const [field, title, , min, max] of FRIEND_TOOLTIP_NUMBERS)
      if (
        !Number.isInteger(settings[field]) ||
        settings[field] < min ||
        settings[field] > max
      ) {
        this.inputs.find((item) => item.field === field)!.input.focus();
        return `Choose a ${title.toLowerCase()} from ${min.toLocaleString()} to ${max.toLocaleString()}.`;
      }
  }
}
