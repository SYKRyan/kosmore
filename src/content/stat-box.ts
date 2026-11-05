import type { STAT_CATALOG, StatValue } from "../shared/stat-catalog";
import { el } from "./ui";

export function statBox(
  definition: (typeof STAT_CATALOG)[number],
  display: StatValue,
) {
  const box = el("div", "metric");
  box.dataset.statId = definition.id;
  box.setAttribute(
    "aria-label",
    `${definition.label}: ${display.value === "—" ? "unavailable" : display.value}`,
  );
  box.title = display.title || definition.description;
  box.append(el("strong", "", display.value), el("span", "", definition.label));
  return box;
}
