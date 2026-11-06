import { el } from "../content/ui";
import type { Settings } from "../shared/types";
import { validSaleAdjustment } from "../shared/sales-prices";

export const SALES_SETTINGS_KEYS = [
  "salesOverlaysEnabled",
  "showSalesLastSale",
  "salesLastSaleSetsPrice",
  "salesLastSaleAdjustment",
  "showSalesLowestListing",
  "salesLowestListingSetsPrice",
  "salesLowestListingAdjustment",
] as const;
const OPTIONS = [
  {
    name: "Last Sale",
    show: "showSalesLastSale",
    click: "salesLastSaleSetsPrice",
    adjustment: "salesLastSaleAdjustment",
    help: "Last sale price across all finishes in Kosmora’s 30-day history.",
  },
  {
    name: "Lowest Listed",
    show: "showSalesLowestListing",
    click: "salesLowestListingSetsPrice",
    adjustment: "salesLowestListingAdjustment",
    help: "Lowest current listing price across all finishes: highest bid, or starting price when there are no bids.",
  },
] as const;

export class SalesSettings {
  readonly host = el("section", "panel");
  private controls: {
    option: (typeof OPTIONS)[number];
    show: HTMLInputElement;
    click: HTMLInputElement;
    adjustment: HTMLInputElement;
  }[] = [];
  constructor(change: (update: Partial<Settings>) => void) {
    this.host.append(
      el("h2", "", "Sales Overlay"),
      el(
        "p",
        "sub",
        "Price badges beneath the starting price on Sell Several Cards and the single sell screen. Clickable badges fill that card’s starting price. These settings apply to both screens.",
      ),
    );
    for (const option of OPTIONS) {
      this.host.append(el("div", "rule"));
      const toggle = (
        key: typeof option.show | typeof option.click,
        label: string,
        hint: string,
        nested = false,
      ) => {
        const row = el("div", `row${nested ? " settings-subsetting" : ""}`),
          input = el("input", nested ? "section-switch price-switch" : ""),
          text = el("label", "label settings-toggle", label);
        input.type = "checkbox";
        input.id = key;
        if (nested) input.setAttribute("role", "switch");
        text.prepend(input);
        row.append(text, el("span", "hint", hint));
        input.addEventListener("change", () => {
          change({ [key]: input.checked });
          this.sync();
        });
        this.host.append(row);
        return input;
      };
      const show = toggle(
        option.show,
        `Show ${option.name} price`,
        option.help,
      );
      const click = toggle(
        option.click,
        `Set price when ${option.name} is clicked`,
        "Fill only the starting price for this card.",
        true,
      );
      const row = el("div", "row settings-subsetting"),
        info = el("div"),
        label = el("label", "", `${option.name} price adjustment`),
        adjustment = el("input");
      row.style.paddingLeft = "54px";
      adjustment.id = option.adjustment;
      adjustment.type = "number";
      adjustment.step = "any";
      label.htmlFor = adjustment.id;
      info.append(
        label,
        el(
          "p",
          "sub",
          "Kosmo added when clicked. Use -1 to price one lower, or a positive number to price higher. Default: 0. Up to six decimal places.",
        ),
      );
      adjustment.addEventListener("input", () =>
        change({
          [option.adjustment]:
            adjustment.value === "" ? NaN : Number(adjustment.value),
        }),
      );
      row.append(info, adjustment);
      this.host.append(row);
      this.controls.push({ option, show, click, adjustment });
    }
  }
  private sync() {
    for (const { show, click, adjustment } of this.controls) {
      click.disabled = !show.checked;
      adjustment.disabled = !show.checked || !click.checked;
    }
  }
  render(settings: Settings) {
    for (const { option, show, click, adjustment } of this.controls) {
      show.checked = settings[option.show];
      click.checked = settings[option.click];
      adjustment.value = String(settings[option.adjustment]);
    }
    this.sync();
  }
  validate(settings: Settings) {
    if (!settings.salesOverlaysEnabled) return;
    for (const { option, adjustment } of this.controls)
      if (
        settings[option.show] &&
        settings[option.click] &&
        !validSaleAdjustment(settings[option.adjustment])
      ) {
        adjustment.focus();
        return `Choose a valid ${option.name} adjustment with up to six decimal places.`;
      }
  }
}
