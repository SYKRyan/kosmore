import { handleKey } from "./social";

export function tradeSurface() {
  if (location.pathname !== "/trades/new") return null;
  const routeHandle = new URLSearchParams(location.search).get("friend");
  if (routeHandle !== null && !/^[A-Za-z0-9_]{1,24}$/.test(routeHandle))
    return null;
  const screen = document.querySelector<HTMLElement>("main .sx-new-trade");
  const steps = screen?.querySelector<HTMLOListElement>(".sx-steps");
  // The native header updates even when selecting a friend does not update the URL.
  const header = screen?.querySelector(".sx-flow-with");
  // The decorative avatar contains initials when the player has no image.
  // Those initials are not part of the handle used for private reminder keys.
  const playerLabel = header?.cloneNode(true) as Element | undefined;
  playerLabel
    ?.querySelectorAll('[aria-hidden="true"], [hidden]')
    .forEach((node) => node.remove());
  const label = playerLabel?.textContent?.trim();
  const headerHandle =
    label && /^[A-Za-z0-9_]{1,24}$/.test(label) ? label : undefined;
  // Prefer the route. The game can also change players in-place without updating it.
  const handle =
    routeHandle &&
    headerHandle &&
    handleKey(routeHandle) !== handleKey(headerHandle)
      ? headerHandle
      : (routeHandle ?? headerHandle);
  if (
    !screen ||
    !steps ||
    !header ||
    !handle ||
    !/^[A-Za-z0-9_]{1,24}$/.test(handle) ||
    screen.querySelector('[data-testid="trade-sent"]')
  )
    return null;
  return {
    screen,
    steps,
    handle,
    key: handleKey(handle),
    filters: screen.querySelector<HTMLElement>(
      '[data-testid="trade-theirs-filters"], [data-testid="trade-mine-filters"]',
    ),
  };
}
