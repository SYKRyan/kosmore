import type { CardContext } from "../shared/types";
export const HOST_ID = "kosmore-root";
export const OVERLAY_ATTR = "data-kosmore-card-overlays";
export function cardOverlaysAllowed(root: Element): boolean {
  return !root.closest(".md-turn, .md-bids, .md-sale, .bsell-row");
}
export function cardOverlayTargets(
  doc: Document = document,
  scope: Document | Element = doc,
): Map<HTMLElement, CardContext> {
  const targets = new Map<HTMLElement, CardContext>();
  const selector = '.kc-article,a.kc-link,a[href*="/card/"]';
  const enclosing =
    scope instanceof Element ? scope.closest<HTMLElement>(selector) : null;
  for (const root of [
    ...(enclosing ? [enclosing] : []),
    ...scope.querySelectorAll<HTMLElement>(selector),
  ]) {
    const container = root.matches(".kc-article")
      ? root
      : (root.querySelector<HTMLElement>(".kc-article") ?? root);
    if (
      !cardOverlaysAllowed(container) ||
      targets.has(container) ||
      !container.querySelector('.kc-img,[data-testid="card-corner"]')
    )
      continue;
    const context = resolveCard(container, doc);
    if (context) targets.set(container, context);
  }
  return targets;
}
function normalize(s: string | null | undefined): string | undefined {
  return s && /^\d{1,18}$/.test(s) ? BigInt(s).toString() : undefined;
}
export function resolveCard(
  target: Element,
  doc: Document = document,
): CardContext | null {
  if (target.closest(`#${HOST_ID},.kc-back,[hidden]`)) return null;
  const picker = target.closest<HTMLElement>(".pick");
  // The shared Pickable overlays its card with a sibling selection button,
  // including collection multi-select entered by long press.
  const pickable =
    picker?.querySelector("button.pick-hit") &&
    picker.querySelector(".kc-article")
      ? picker
      : null;
  const batchHead =
    doc.location.pathname === "/market/sell/batch" &&
    !target.closest(
      "button, input, select, textarea, [role='button'], [role='combobox']",
    )
      ? target.closest<HTMLElement>(".bsell-row .bsell-head")
      : null;
  // Activity thumbnails are decorative to screen readers, but their outer
  // auction links are visible interactive cards with an independently readable ID.
  const activityLink =
    doc.location.pathname === "/market"
      ? target.closest<HTMLAnchorElement>("a.mk-act-main, a.md-lot-link")
      : null;
  if (activityLink) {
    const href = new URL(
      activityLink.getAttribute("href") ?? "",
      doc.location.href,
    );
    if (
      href.origin !== doc.location.origin ||
      !/^\/market\/[^/]+$/.test(href.pathname) ||
      !activityLink.closest(".mk-act, .md-lot") ||
      !activityLink.querySelector(".kc-article")
    )
      return null;
  }
  const viewer = target.closest(".ko-viewer-sheet");
  const summary = target.closest(".ko-summary .ko-grid > li");
  const reveal = target.closest(".ko-card");
  if (reveal && !reveal.classList.contains("ko-beat-shown")) return null;
  const linked = target.closest<HTMLElement>('a[href*="/card/"],a.kc-link');
  const article =
    target.closest<HTMLElement>(".kc-article") ??
    summary?.querySelector<HTMLElement>(".kc-article") ??
    reveal?.querySelector<HTMLElement>(".ko-face-front .kc-article");
  const root = pickable ?? batchHead ?? activityLink ?? article ?? linked;
  if (!root) return null;
  if (root.closest('[aria-hidden="true"],[hidden],[inert]')) return null;
  if (root.closest(".ko-face-back")) return null;
  const link = linked ?? root.closest<HTMLAnchorElement>('a[href*="/card/"]');
  const linkUrl = link?.getAttribute("href")
    ? new URL(link.getAttribute("href")!, doc.location.href)
    : null;
  const cardLink =
    linkUrl?.origin === doc.location.origin
      ? linkUrl.pathname.match(/^\/card\/(\d+)$/)
      : null;
  const image = root
    .querySelector("img.kc-img")
    ?.getAttribute("src")
    ?.match(/\/media\/cards\/(\d+)\//);
  const corner = root
    .querySelector('[data-testid="card-corner"]')
    ?.textContent?.match(/No\.\s*(\d+)/i);
  let id =
    normalize(cardLink?.[1]) ?? normalize(image?.[1]) ?? normalize(corner?.[1]);
  if (!id && viewer) {
    id = normalize(
      viewer
        .querySelector('[data-testid="card-corner"]')
        ?.textContent?.match(/No\.\s*(\d+)/i)?.[1],
    );
  }
  if (!id) return null;
  const face = root.querySelector(".kc") ?? root;
  const url = new URL(doc.location.href);
  const pageCopy =
    url.pathname === `/card/${id}` ? url.searchParams.get("copy") : null;
  const copyId =
    activityLink || batchHead || pickable
      ? null
      : (linkUrl?.searchParams.get("copy") ?? pageCopy);
  const openingIds =
    url.pathname === "/packs/open"
      ? (url.searchParams.get("batch") ?? url.searchParams.get("id") ?? "")
          .split(",")
          .filter((s) => /^[a-f0-9-]{36}$/i.test(s))
      : [];
  let surface: CardContext["surface"] = "page",
    entryIndex: number | undefined;
  if (viewer) {
    surface = "viewer";
    const text = viewer.querySelector(".ko-viewer-count")?.textContent;
    const match = text?.match(/^(\d+)\s/);
    if (match) entryIndex = Number(match[1]) - 1;
  } else if (summary) {
    surface = "summary";
    entryIndex = [...summary.parentElement!.children].indexOf(summary);
  } else if (reveal) {
    surface = "reveal";
    entryIndex = doc.querySelectorAll(".ko-tray > li.on").length - 1;
    if (entryIndex < 0) entryIndex = undefined;
  }
  const anchor = (summary ?? reveal ?? root) as HTMLElement;
  return {
    subjectId: id,
    name:
      (batchHead?.querySelector(".bsell-name")?.textContent?.trim() ||
        undefined) ??
      (activityLink
        ?.querySelector(".mk-act-name > b, .md-lot-name > b")
        ?.textContent?.trim() ||
        undefined) ??
      root.querySelector(".kc-name")?.textContent?.trim() ??
      link?.getAttribute("aria-label") ??
      `Card ${id}`,
    copyId: copyId && /^[a-f0-9-]{36}$/i.test(copyId) ? copyId : undefined,
    variant: {
      veil:
        face.classList.contains("kc-veil") ||
        !!reveal?.classList.contains("ko-card-veil"),
      fullArt: face.classList.contains("kc-fa"),
    },
    surface,
    anchor,
    openingIds,
    entryIndex,
  };
}
export function contextKey(c: CardContext): string {
  return [
    c.subjectId,
    c.copyId,
    c.surface,
    c.variant.veil,
    c.variant.fullArt,
    c.openingIds.join(","),
    c.entryIndex,
  ].join(":");
}
export function topDialog(
  doc: Document = document,
): HTMLDialogElement | undefined {
  return [...doc.querySelectorAll<HTMLDialogElement>("dialog[open]")].at(-1);
}
