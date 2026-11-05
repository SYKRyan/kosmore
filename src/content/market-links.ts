export function marketSearchPath(name: string): string {
  return `/market?${new URLSearchParams({ q: name.trim() })}`;
}

export function enableMarketLink(link: HTMLAnchorElement): void {
  // These links can sit inside a card link or a native multi-select surface.
  for (const type of [
    "pointerdown",
    "pointerup",
    "mousedown",
    "mouseup",
    "dblclick",
    "auxclick",
  ])
    link.addEventListener(type, (event) => event.stopPropagation());
  for (const type of ["keydown", "keyup"])
    link.addEventListener(type, (event) => {
      if (
        (event as KeyboardEvent).key === "Enter" ||
        (event as KeyboardEvent).key === " "
      )
        event.stopPropagation();
    });
  link.addEventListener("click", (event) => {
    event.stopPropagation();
    if (!link.hasAttribute("href")) {
      event.preventDefault();
      return;
    }
    if (
      event.button === 0 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey &&
      !event.altKey
    ) {
      event.preventDefault();
      link.ownerDocument.defaultView!.location.assign(link.href);
    }
  });
}
