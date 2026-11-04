export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = "",
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}
export function button(
  text: string,
  action: () => void,
  className = "",
): HTMLButtonElement {
  const b = el("button", className, text);
  b.type = "button";
  b.addEventListener("click", action);
  return b;
}
export function note(text: string, error = false) {
  return el("p", error ? "note error" : "note", text);
}
