import type { Rarity } from "../kosmora/trade-interest";

// Kosmora's native RarityGem geometry and gradient colors.
const gems: Record<
  Rarity,
  { outline: string; facets: string[]; colors: string[] }
> = {
  Common: {
    outline: "M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18Z",
    facets: ["M12 3v18", "M3 12h18"],
    colors: ["#e9edf3", "#9aa3b2", "#4b5262"],
  },
  Uncommon: {
    outline: "M12 2 21 12 12 22 3 12Z",
    facets: ["M12 2v20", "M3 12h18", "M7.5 7h9M7.5 17h9"],
    colors: ["#b8f5d8", "#2fbf86", "#0d5a3c"],
  },
  Rare: {
    outline: "M12 2.5 21.5 19.5h-19Z",
    facets: ["M12 2.5 12 14", "M2.5 19.5 12 14l9.5 5.5"],
    colors: ["#cfe6ff", "#3d8bff", "#12306e"],
  },
  Epic: {
    outline: "M12 2 20.7 7v10L12 22l-8.7-5V7Z",
    facets: ["M12 2v20", "M3.3 7 20.7 17", "M20.7 7 3.3 17"],
    colors: ["#f0d6ff", "#a45cff", "#43167a"],
  },
  Legendary: {
    outline:
      "M12 1.8l2.9 6.4 7 .7-5.2 4.7 1.5 6.9L12 17l-6.2 3.5 1.5-6.9L2.1 8.9l7-.7Z",
    facets: [
      "M12 1.8V17",
      "M2.1 8.9 12 12.4l9.9-3.5",
      "M5.8 20.5 12 12.4l6.2 8.1",
    ],
    colors: ["#fff4c2", "#f2b93b", "#8a5a0a"],
  },
  Mythic: {
    outline:
      "M12 1l2.3 6.2L20.5 4l-3.2 6L23 12l-5.7 2 3.2 6-6.2-3.2L12 23l-2.3-6.2L3.5 20l3.2-6L1 12l5.7-2-3.2-6 6.2 3.2Z",
    facets: ["M12 1v22", "M1 12h22", "M3.5 4l17 16", "M20.5 4l-17 16"],
    colors: ["#ffd6f5", "#ff5fb8", "#5b2cff"],
  },
};
function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string>,
) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attrs))
    node.setAttribute(key, value);
  return node;
}
export function raritySymbol(rarity: Rarity) {
  const gem = gems[rarity],
    id = `kosmore-gem-${rarity.toLowerCase()}`;
  const icon = svg("svg", {
    viewBox: "0 0 24 24",
    "aria-hidden": "true",
    focusable: "false",
    class: "rarity-symbol",
  });
  const defs = svg("defs", {}),
    gradient = svg("linearGradient", {
      id,
      x1: "0.1",
      y1: "0",
      x2: "0.9",
      y2: "1",
    });
  gem.colors.forEach((color, i) =>
    gradient.append(
      svg("stop", { offset: String(i / 2), "stop-color": color }),
    ),
  );
  const shine = svg("radialGradient", {
    id: `${id}-shine`,
    cx: "0.32",
    cy: "0.25",
    r: "0.55",
  });
  [
    ["0", "0.8"],
    ["0.35", "0.12"],
    ["1", "0"],
  ].forEach(([offset, opacity]) =>
    shine.append(
      svg("stop", { offset, "stop-color": "#fff", "stop-opacity": opacity }),
    ),
  );
  defs.append(gradient, shine);
  const facets = svg("g", {
    stroke: "#fff",
    "stroke-opacity": "0.35",
    "stroke-width": "0.6",
    fill: "none",
  });
  gem.facets.forEach((d) => facets.append(svg("path", { d })));
  icon.append(
    defs,
    svg("path", {
      d: gem.outline,
      fill: `url(#${id})`,
      stroke: "#ffffff88",
      "stroke-width": "1.1",
      "stroke-linejoin": "round",
    }),
    facets,
    svg("path", { d: gem.outline, fill: `url(#${id}-shine)` }),
  );
  return icon;
}
