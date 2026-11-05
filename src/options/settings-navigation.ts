import { el } from "../content/ui";

export function settingsNavigation(
  groups: { id: string; label: string; host: HTMLElement; path: string }[],
) {
  const nav = el("nav", "settings-nav");
  nav.setAttribute("aria-label", "Settings groups");
  nav.append(el("p", "nav-heading", "Settings"));
  const links = groups.map((group) => {
    group.host.id = group.id;
    group.host.tabIndex = -1;
    const link = el("a", "settings-nav-link");
    link.href = `#${group.id}`;
    link.title = group.label;
    link.setAttribute("aria-label", group.label);
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    for (const [key, value] of Object.entries({
      viewBox: "0 0 24 24",
      width: "18",
      height: "18",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.7",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "aria-hidden": "true",
    }))
      svg.setAttribute(key, value);
    const path = document.createElementNS(svg.namespaceURI, "path");
    path.setAttribute("d", group.path);
    svg.append(path);
    link.append(svg, el("span", "nav-label", group.label));
    nav.append(link);
    return link;
  });
  let scheduled = false;
  const update = () => {
    scheduled = false;
    const bottom =
      scrollY + innerHeight >= document.documentElement.scrollHeight - 2;
    let current = 0;
    groups.forEach((group, index) => {
      if (group.host.getBoundingClientRect().top <= 48) current = index;
    });
    if (bottom) current = groups.length - 1;
    links.forEach((link, index) => {
      if (index === current) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });
  };
  const schedule = () => {
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(update);
    }
  };
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
  window.addEventListener("hashchange", schedule);
  requestAnimationFrame(update);
  return nav;
}
