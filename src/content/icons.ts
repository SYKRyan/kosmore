/** Matching refresh and close icons for tooltip controls. */
export function headerIcon(
  kind: "refresh" | "close",
  size = 16,
): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  for (const [key, value] of Object.entries({
    viewBox: "0 0 24 24",
    width: String(size),
    height: String(size),
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "1.7",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
  }))
    svg.setAttribute(key, value);
  const path = document.createElementNS(svg.namespaceURI, "path");
  path.setAttribute(
    "d",
    kind === "refresh"
      ? "M3 12a9 9 0 0 1 15.36-6.36L21 8 M21 3v5h-5 M21 12a9 9 0 0 1-15.36 6.36L3 16 M3 21v-5h5"
      : "M6 6l12 12 M18 6 6 18",
  );
  svg.append(path);
  return svg;
}

export function cardIcon(
  kind: "auction" | "sale" | "friend" | "quest",
  size = 14,
): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  for (const [key, value] of Object.entries({
    viewBox: "0 0 24 24",
    width: String(size),
    height: String(size),
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "1.7",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
  }))
    svg.setAttribute(key, value);
  const path = document.createElementNS(svg.namespaceURI, "path");
  path.setAttribute(
    "d",
    kind === "auction"
      ? "m14 13-8.5 8.5a2.12 2.12 0 0 1-3-3L11 10 M16 16l6-6 M8 8l6-6 M9 7l8 8 M21 11l-8-8"
      : kind === "sale"
        ? "M3 11a9 9 0 1 1 2.7 7 M3 4v7h7 M12 7v5l3 2"
        : kind === "quest"
          ? "m12 2 2.6 7.4L22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6Z"
          : "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  );
  svg.append(path);
  return svg;
}

/** Small chevron indicating expandable content. */
export function disclosureIcon(size = 12): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  for (const [key, value] of Object.entries({
    viewBox: "0 0 24 24",
    width: String(size),
    height: String(size),
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "1.7",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
  }))
    svg.setAttribute(key, value);
  const path = document.createElementNS(svg.namespaceURI, "path");
  path.setAttribute("d", "m6 9 6 6 6-6");
  svg.append(path);
  return svg;
}

/** Shared pushpin used by tooltip controls. */
export function pinIcon(size = 16): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  for (const [key, value] of Object.entries({
    viewBox: "0 0 24 24",
    width: String(size),
    height: String(size),
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "1.7",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
  }))
    svg.setAttribute(key, value);
  const path = document.createElementNS(svg.namespaceURI, "path");
  path.setAttribute(
    "d",
    "M16 3 21 8 17 9 14 12 14 16 12 18 6 12 8 10 12 10 15 7Z M9 15 3 21",
  );
  svg.append(path);
  return svg;
}
