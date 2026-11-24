import { beforeEach, expect, it, vi } from "vitest";
import {
  editableSalesInput,
  fillSalesInput,
  salesTargets,
} from "../../src/kosmora/sales";
import { batchSellRow, singleSellFixture } from "../fixtures/sell-many";
beforeEach(() => {
  document.body.innerHTML = "";
  history.replaceState(null, "", "/collection");
});
it("only edits the field when the selected price differs from the displayed amount", () => {
  const input = document.createElement("input");
  document.body.append(input);
  const edit = vi.fn();
  const change = vi.fn();
  input.addEventListener("input", edit);
  input.addEventListener("change", change);
  fillSalesInput(input, "1499");
  fillSalesInput(input, "1499");
  expect(input.value).toBe("1499");
  input.value = "1,499";
  fillSalesInput(input, "1499");
  expect(input.value).toBe("1,499");
  expect(edit).toHaveBeenCalledTimes(1);
  expect(change).toHaveBeenCalledTimes(1);
  input.value = "149";
  fillSalesInput(input, "1499");
  expect(input.value).toBe("1499");
  expect(edit).toHaveBeenCalledTimes(2);
});
it("associates each batch price with its own card and excludes other controls and routes", () => {
  history.replaceState(null, "", "/market/sell/batch");
  document.body.innerHTML =
    batchSellRow("42", "Northern Lights") +
    batchSellRow("46", "Andromeda") +
    '<input aria-label="Reserve price">';
  expect([...salesTargets().values()].map((t) => t.context.subjectId)).toEqual([
    "42",
    "46",
  ]);
  history.replaceState(null, "", "/collection");
  expect(salesTargets().size).toBe(0);
});
it("targets only the selected single-sale starting price and waits out mismatched navigation", () => {
  history.replaceState(null, "", "/market/sell?subject=42");
  document.body.innerHTML = singleSellFixture();
  expect([...salesTargets().keys()].map((i) => i.dataset.testid)).toEqual([
    "sell-start",
  ]);
  history.replaceState(null, "", "/market/sell?subject=46");
  expect(salesTargets().size).toBe(0);
});
it("uses the native setter to notify controlled inputs and never writes read-only or disabled fields", () => {
  const input = document.createElement("input");
  input.value = "12";
  document.body.append(input);
  const descriptor = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!;
  let tracked = "12",
    state = "12";
  Object.defineProperty(input, "value", {
    configurable: true,
    get() {
      return descriptor.get!.call(this);
    },
    set(value) {
      tracked = value;
      descriptor.set!.call(this, value);
    },
  });
  input.addEventListener("input", () => {
    if (input.value !== tracked) state = input.value;
  });
  const change = vi.fn();
  input.addEventListener("change", change);
  fillSalesInput(input, "11");
  expect(state).toBe("11");
  expect(change).toHaveBeenCalledTimes(1);
  input.readOnly = true;
  expect(editableSalesInput(input)).toBe(false);
  expect(() => fillSalesInput(input, "10")).toThrow("read-only");
  expect(input.value).toBe("11");
  input.readOnly = false;
  document.body.innerHTML = "<fieldset disabled></fieldset>";
  document.querySelector("fieldset")!.append(input);
  expect(editableSalesInput(input)).toBe(false);
});
