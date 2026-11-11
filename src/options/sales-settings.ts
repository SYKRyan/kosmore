import { button, el } from "../content/ui";
import type { Settings } from "../shared/types";
import {
  SALE_MINIMUMS,
  type SaleRarity,
  validDiscountThreshold,
  validSaleAdjustment,
  validSalePrice,
} from "../shared/sales-prices";

const RARITIES = Object.keys(SALE_MINIMUMS) as SaleRarity[];

export const SALES_SETTINGS_KEYS = [
  "salesOverlaysEnabled",
  "showSalesLastSale",
  "salesLastSaleSetsPrice",
  "salesLastSaleAdjustment",
  "showSalesLowestListing",
  "salesLowestListingSetsPrice",
  "salesLowestListingAdjustment",
  "showSalesMyLastListing",
  "salesMyLastListingSetsPrice",
  "salesMyLastListingAdjustment",
  "salesDiscountEnabled",
  "salesDiscountAmount",
  "salesDiscountMode",
  "salesDiscountThreshold",
  "salesCustomMinimumsEnabled",
  "salesCustomMinimums",
  "salesQuickPricesEnabled",
  "salesQuickPrices",
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
  {
    name: "My Last Listing",
    show: "showSalesMyLastListing",
    click: "salesMyLastListingSetsPrice",
    adjustment: "salesMyLastListingAdjustment",
    help: "Your most recent starting price for this card, from My Sales history across all finishes.",
  },
] as const;

type SubgroupKey =
  | "salesDiscountEnabled"
  | "salesCustomMinimumsEnabled"
  | "salesQuickPricesEnabled";

export class SalesSettings {
  readonly host = el("section", "panel");
  private discountAmount: HTMLInputElement;
  private discountMode = el("select");
  private discountThreshold: HTMLInputElement;
  private minimums = new Map<SaleRarity, HTMLInputElement>();
  private quickInput = el("input");
  private quickList = el("ol", "quick-price-list");
  private prices: number[] = [];
  private minimumValues = { ...SALE_MINIMUMS };
  private subgroups: {
    key: SubgroupKey;
    toggle: HTMLInputElement;
    fields: HTMLFieldSetElement;
  }[] = [];
  private controls: {
    option: (typeof OPTIONS)[number];
    show: HTMLInputElement;
    click: HTMLInputElement;
    adjustment: HTMLInputElement;
  }[] = [];
  constructor(private change: (update: Partial<Settings>) => void) {
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
      const show = this.toggle(
        option.show,
        `Show ${option.name} price`,
        option.help,
      );
      const click = this.toggle(
        option.click,
        `Set price when ${option.name} is clicked`,
        "Fill only the starting price for this card.",
        true,
      );
      const adjustment = this.numberSetting(
        this.host,
        `${option.name} price adjustment`,
        option.adjustment,
        (value) => change({ [option.adjustment]: value }),
        {
          hint: "Kosmo added when clicked. Use -1 to price one lower, or a positive number to price higher. Default: 0. Up to six decimal places.",
        },
      );
      this.controls.push({ option, show, click, adjustment });
    }
    const discount = this.subgroup(
      "salesDiscountEnabled",
      "Enable Discount button",
      "Fill the starting price at a discount after repeated unsold listings for the same copy.",
    );
    this.discountAmount = this.numberSetting(
      discount,
      "Amount",
      "salesDiscountAmount",
      (value) => change({ salesDiscountAmount: value }),
      { min: 1 },
    );
    this.discountMode.id = "salesDiscountMode";
    for (const [value, label] of [
      ["flat", "Flat"],
      ["percent", "Percent"],
    ]) {
      const option = el("option", "", label);
      option.value = value;
      this.discountMode.append(option);
    }
    this.discountMode.addEventListener("change", () =>
      change({
        salesDiscountMode:
          this.discountMode.value === "percent" ? "percent" : "flat",
      }),
    );
    const modeRow = this.settingRow("Discount type", this.discountMode);
    modeRow.classList.add("sales-discount-mode");
    discount.append(modeRow);
    this.discountThreshold = this.numberSetting(
      discount,
      "Threshold",
      "salesDiscountThreshold",
      (value) => change({ salesDiscountThreshold: value }),
      {
        min: 1,
        step: "1",
        hint: "Consecutive unsold listings needed to enable the discount.",
      },
    );

    const minimums = this.subgroup(
      "salesCustomMinimumsEnabled",
      "Use Custom Rarity Minimums",
      "Show a warning when a starting price falls below your minimum.",
    );
    for (const rarity of RARITIES) {
      this.minimums.set(
        rarity,
        this.numberSetting(
          minimums,
          rarity,
          `salesMinimum${rarity}`,
          (value) => {
            this.minimumValues = { ...this.minimumValues, [rarity]: value };
            change({ salesCustomMinimums: this.minimumValues });
          },
          { min: SALE_MINIMUMS[rarity] },
        ),
      );
    }

    const quick = this.subgroup(
      "salesQuickPricesEnabled",
      "Quick Prices",
      "Show your preset starting prices in this order on the sale screens.",
    );
    this.quickInput.id = "salesQuickPrice";
    this.quickInput.type = "number";
    this.quickInput.min = "0.000001";
    this.quickInput.step = "any";
    const add = () => {
      const price = this.quickInput.valueAsNumber;
      this.quickInput.setCustomValidity(
        validSalePrice(price)
          ? ""
          : "Enter a positive price with up to six decimal places.",
      );
      if (!this.quickInput.reportValidity()) return;
      this.setQuickPrices([...this.prices, price]);
      this.quickInput.value = "";
      this.quickInput.focus();
    };
    this.quickInput.addEventListener("input", () =>
      this.quickInput.setCustomValidity(""),
    );
    this.quickInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      add();
    });
    const addRow = el("div", "quick-price-add");
    addRow.append(button("Add price", add));
    quick.append(
      this.quickList,
      this.settingRow("Price", this.quickInput),
      addRow,
    );
  }
  private toggle(
    key: (typeof OPTIONS)[number]["show" | "click"] | SubgroupKey,
    label: string,
    hint: string,
    nested = false,
  ) {
    const row = el("div", `row${nested ? " settings-subsetting" : ""}`),
      input = el("input", nested ? "section-switch price-switch" : ""),
      text = el("label", "label settings-toggle", label);
    input.type = "checkbox";
    input.id = key;
    if (nested) input.setAttribute("role", "switch");
    text.prepend(input);
    row.append(text, el("span", "hint", hint));
    input.addEventListener("change", () => {
      this.change({ [key]: input.checked });
      this.sync();
    });
    this.host.append(row);
    return input;
  }
  private subgroup(key: SubgroupKey, label: string, hint: string) {
    this.host.append(el("div", "rule"));
    const toggle = this.toggle(key, label, hint),
      fields = el("fieldset", "sales-subsettings");
    fields.setAttribute("aria-label", label);
    this.subgroups.push({ key, toggle, fields });
    this.host.append(fields);
    return fields;
  }
  private settingRow(
    name: string,
    control: HTMLInputElement | HTMLSelectElement,
    hint?: string,
  ) {
    const row = el("div", "row settings-subsetting settings-subsetting-text"),
      info = el("div"),
      label = el("label", "", name);
    label.htmlFor = control.id;
    info.append(label);
    if (hint) info.append(el("p", "sub", hint));
    row.append(info, control);
    return row;
  }
  private numberSetting(
    fields: HTMLElement,
    name: string,
    id: string,
    change: (value: number) => void,
    {
      min,
      step = "any",
      hint,
    }: { min?: number; step?: string; hint?: string } = {},
  ) {
    const input = el("input");
    input.id = id;
    input.type = "number";
    if (min !== undefined) input.min = String(min);
    input.step = step;
    input.addEventListener("input", () => change(input.valueAsNumber));
    fields.append(this.settingRow(name, input, hint));
    return input;
  }
  private setQuickPrices(prices: number[]) {
    this.prices = prices;
    this.change({ salesQuickPrices: prices });
    this.renderQuickPrices();
  }
  private renderQuickPrices() {
    this.quickList.replaceChildren();
    for (const [index, price] of this.prices.entries()) {
      const row = el("li", "row settings-subsetting settings-subsetting-text"),
        actions = el("div", "quick-price-actions");
      for (const [delta, direction, arrow] of [
        [-1, "up", "↑"],
        [1, "down", "↓"],
      ] as const) {
        const destination = index + delta;
        const move = button(arrow, () => {
          const prices = [...this.prices];
          [prices[index], prices[destination]] = [
            prices[destination],
            prices[index],
          ];
          this.setQuickPrices(prices);
          this.quickList.children[destination]
            ?.querySelector<HTMLButtonElement>("button:not(:disabled)")
            ?.focus();
        });
        move.disabled = destination < 0 || destination >= this.prices.length;
        move.setAttribute("aria-label", `Move price ${index + 1} ${direction}`);
        actions.append(move);
      }
      const remove = button("Remove", () => {
        this.setQuickPrices(this.prices.filter((_, i) => i !== index));
        this.quickInput.focus();
      });
      remove.setAttribute("aria-label", `Remove price ${index + 1}`);
      actions.append(remove);
      row.append(el("span", "", String(price)), actions);
      this.quickList.append(row);
    }
  }
  private sync() {
    for (const { show, click, adjustment } of this.controls) {
      click.disabled = !show.checked;
      adjustment.disabled = !show.checked || !click.checked;
    }
    for (const { toggle, fields } of this.subgroups)
      fields.disabled = !toggle.checked;
  }
  render(settings: Settings) {
    for (const { option, show, click, adjustment } of this.controls) {
      show.checked = settings[option.show];
      click.checked = settings[option.click];
      adjustment.value = String(settings[option.adjustment]);
    }
    for (const { key, toggle } of this.subgroups)
      toggle.checked = settings[key];
    this.discountAmount.value = String(settings.salesDiscountAmount);
    this.discountMode.value = settings.salesDiscountMode;
    this.discountThreshold.value = String(settings.salesDiscountThreshold);
    this.minimumValues = settings.salesCustomMinimums;
    for (const [rarity, input] of this.minimums)
      input.value = String(this.minimumValues[rarity]);
    this.prices = settings.salesQuickPrices;
    this.quickInput.value = "";
    this.quickInput.setCustomValidity("");
    this.renderQuickPrices();
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
    if (settings.salesDiscountEnabled) {
      if (!validSalePrice(settings.salesDiscountAmount, 1)) {
        this.discountAmount.focus();
        return "Enter a discount amount of at least 1 with up to six decimal places.";
      }
      if (!validDiscountThreshold(settings.salesDiscountThreshold)) {
        this.discountThreshold.focus();
        return "Enter a whole-number discount threshold of at least 1.";
      }
    }
    if (settings.salesCustomMinimumsEnabled)
      for (const [rarity, input] of this.minimums)
        if (
          !validSalePrice(
            settings.salesCustomMinimums[rarity],
            SALE_MINIMUMS[rarity],
          )
        ) {
          input.focus();
          return `Enter a ${rarity} minimum of at least ${SALE_MINIMUMS[rarity]} with up to six decimal places.`;
        }
  }
}
