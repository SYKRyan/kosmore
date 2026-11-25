import { el } from "../content/ui";
import { tooltipScale } from "../shared/popup-layout";
import type { Settings } from "../shared/types";

export function tooltipScaleControls(
  host: HTMLElement,
  settings: () => Settings,
  lockKey: "lockTooltipToBrowserZoom" | "lockFriendTooltipToBrowserZoom",
  sharedPercent?: () => number,
) {
  const row = el("div", "row");
  const info = el("div");
  const label = el("label", "setting-name", "UI Scale");
  const field = el("span", "tooltip-scale-field");
  const input = el("input");
  input.type = "number";
  input.id = label.htmlFor = sharedPercent ? "friend-tooltip-ui-scale" : "tooltip-ui-scale";
  input.readOnly = !!sharedPercent;
  input.min = "20";
  input.max = "200";
  info.append(label, el("p", "sub", sharedPercent
    ? "Set the scale for both tooltips in Hover Tooltip settings."
    : "Scale the card and Social tooltip content and dimensions from 20% to 200%."));
  field.append(input, el("span", "", "%"));
  row.append(info, field);
  const lockRow = el("div", "row settings-subsetting");
  const lockLabel = el("label", "label settings-toggle", "Lock to browser zoom");
  const lock = el("input", "section-switch");
  lock.type = "checkbox";
  lock.setAttribute("role", "switch");
  lockLabel.prepend(lock);
  const hint = el("span", "hint", "Keep the tooltip at your chosen UI Scale as browser zoom changes.");
  const preview = el("span");
  hint.append(preview);
  lockRow.append(lockLabel, hint);
  host.append(row, lockRow, el("div", "rule"));

  let revision = 0;
  let browserZoom: number | undefined;
  const percent = new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 2 });
  function renderPreview() {
    const validScale = Number.isFinite(input.valueAsNumber) && input.validity.valid;
    preview.textContent = lock.checked && validScale && browserZoom
      ? ` At ${percent.format(browserZoom)} browser zoom, the effective scale is ${percent.format(tooltipScale(input.valueAsNumber, lock.checked, browserZoom))}.`
      : "";
  }
  async function refreshZoom() {
    const current = ++revision;
    if (!lock.checked) return;
    const games = await chrome.tabs.query({ url: "https://kosmora.io/*", currentWindow: true });
    const tab = games.sort((a, b) => b.lastAccessed - a.lastAccessed)[0];
    const zoom = tab?.id === undefined ? undefined : await chrome.tabs.getZoom(tab.id);
    if (current !== revision) return;
    browserZoom = zoom;
    renderPreview();
  }
  const updateZoom = () => { void refreshZoom().catch(() => {}); };
  function render() {
    const draft = settings();
    lock.checked = draft[lockKey];
    input.value = String(sharedPercent ? sharedPercent() : draft.tooltipUiScale);
    renderPreview();
    updateZoom();
  }
  if (!sharedPercent) input.addEventListener("input", () => {
    settings().tooltipUiScale = input.valueAsNumber;
    renderPreview();
  });
  lock.addEventListener("change", () => {
    settings()[lockKey] = lock.checked;
    renderPreview();
    updateZoom();
  });
  chrome.tabs.onZoomChange.addListener(updateZoom);
  chrome.tabs.onActivated.addListener(updateZoom);
  chrome.tabs.onRemoved.addListener(updateZoom);
  window.addEventListener("focus", updateZoom);
  function validate() {
    if (!Number.isInteger(settings().tooltipUiScale) || !input.validity.valid) {
      input.focus();
      return "Choose a whole-number UI Scale from 20% to 200%.";
    }
  }
  return { render, validate };
}
