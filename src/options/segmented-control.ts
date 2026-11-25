import { el } from "../content/ui";

export function segmentedControl<T extends string>(
  name: string,
  label: string,
  choices: readonly (readonly [T, string])[],
  change: (value: T) => void,
) {
  const group = el("fieldset", "segmented-control");
  group.setAttribute("aria-label", label);
  for (const [value, text] of choices) {
    const segment = el("label");
    const input = el("input");
    input.type = "radio";
    input.name = name;
    input.value = value;
    input.addEventListener("change", () => change(value));
    segment.append(input, el("span", "", text));
    group.append(segment);
  }
  return {
    group,
    select(value: T) {
      for (const input of group.querySelectorAll("input"))
        input.checked = input.value === value;
    },
  };
}
