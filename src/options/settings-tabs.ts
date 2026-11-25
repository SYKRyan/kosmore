import { el } from "../content/ui";
import { segmentedControl } from "./segmented-control";

export function settingsTabs(label: string, panels: HTMLElement[]) {
  const selector = segmentedControl(
    panels[0].id + "-selector",
    label,
    panels.map((panel) => [panel.id, panel.querySelector("h3")!.textContent!]),
    (id) => {
      show(id);
      history.replaceState(null, "", "#" + id);
    },
  );
  const list = selector.group;
  list.classList.add("settings-tabs");
  list.setAttribute("role", "radiogroup");
  const inputs = [...list.querySelectorAll("input")];
  for (const input of inputs) {
    input.id = input.value + "-tab";
    input.setAttribute("aria-controls", input.value);
  }
  list.addEventListener("keydown", (event) => {
    if (event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const input = event.key === "Home" ? inputs[0] : inputs[inputs.length - 1];
    input.focus();
    input.click();
  });
  function show(id: string) {
    selector.select(id);
    for (const panel of panels) panel.hidden = panel.id !== id;
  }
  const fromHash = () => panels.find((panel) => "#" + panel.id === location.hash);
  show((fromHash() ?? panels[0]).id);
  window.addEventListener("hashchange", () => {
    const panel = fromHash();
    if (panel) {
      show(panel.id);
      list.scrollIntoView({ block: "nearest" });
    }
  });
  const content = el("fieldset", "settings-group-content tab-panels");
  content.setAttribute("aria-label", label);
  content.append(...panels);
  return [list, content];
}
