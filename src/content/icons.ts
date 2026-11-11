/** Compact icons for the card tooltip's tabs and settings control. */
export function tooltipIcon(
  kind: "market" | "history" | "trade" | "notes" | "settings",
  size = 20,
): SVGSVGElement {
  if (kind === "trade") return cardIcon("friend", size);
  if (kind === "history") return cardIcon("history", size);
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
  if (kind === "market") {
    const bars = document.createElementNS(svg.namespaceURI, "path");
    bars.setAttribute("d", "M3 10h3v9H3Z M8 6h3v8H8Z M13 2h3v13h-3Z");
    bars.setAttribute("fill", "currentColor");
    bars.setAttribute("fill-opacity", "0.55");
    bars.setAttribute("stroke", "none");
    svg.append(bars);
  }
  const path = document.createElementNS(svg.namespaceURI, "path");
  path.setAttribute(
    "d",
    {
      market: "m3 22 7-7 4 4 8-8 M17 11h5v5",
      notes: "M14 3H5v18h14v-9 M8 8h3 M8 13h3 M8 17h7 m-2-8 7-7 2 2-7 7-3 1Z",
      settings:
        "M10.54 4.64 L10.05 2.19 L13.95 2.19 L13.46 4.64 L16.17 5.76 L17.56 3.69 L20.31 6.44 L18.24 7.83 L19.36 10.54 L21.81 10.05 L21.81 13.95 L19.36 13.46 L18.24 16.17 L20.31 17.56 L17.56 20.31 L16.17 18.24 L13.46 19.36 L13.95 21.81 L10.05 21.81 L10.54 19.36 L7.83 18.24 L6.44 20.31 L3.69 17.56 L5.76 16.17 L4.64 13.46 L2.19 13.95 L2.19 10.05 L4.64 10.54 L5.76 7.83 L3.69 6.44 L6.44 3.69 L7.83 5.76Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
    }[kind],
  );
  svg.append(path);
  return svg;
}

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
  kind: "auction" | "sale" | "history" | "friend" | "quest" | "trade" | "gift",
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
    {
      auction:
        "M20 13 13 20a2 2 0 0 1-3 0l-8-8V3h9l9 8a2 2 0 0 1 0 2Z M7 7h.01",
      sale: "m14 13-8.5 8.5a2.12 2.12 0 0 1-3-3L11 10 M16 16l6-6 M8 8l6-6 M9 7l8 8 M21 11l-8-8",
      history: "M3 11a9 9 0 1 1 2.7 7 M3 4v7h7 M12 7v5l3 2",
      quest: "m12 2 2.6 7.4L22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6Z",
      friend:
        "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
      trade: "M3 8h17m-4-4 4 4-4 4M21 16H4m4-4-4 4 4 4",
      gift: "M4 10h16v11H4zM3 7h18v3H3zM12 7v14M12 7H8.5A2.5 2.5 0 1 1 11 4.5zM12 7h3.5A2.5 2.5 0 1 0 13 4.5z",
    }[kind],
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
