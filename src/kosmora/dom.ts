import type { CardContext } from "../shared/types";
export const HOST_ID = "kosmore-root";
function normalize(s: string | null | undefined): string | undefined {
  return s && /^\d{1,18}$/.test(s) ? BigInt(s).toString() : undefined;
}
export function resolveCard(
  target: Element,
  doc: Document = document,
): CardContext | null {
  if (target.closest(`#${HOST_ID},.kc-back,[hidden]`)) return null;
  const viewer = target.closest(".ko-viewer-sheet");
  const summary = target.closest(".ko-summary .ko-grid > li");
  const reveal = target.closest(".ko-card");
  if (reveal && !reveal.classList.contains("ko-beat-shown")) return null;
  const linked = target.closest<HTMLElement>('a[href*="/card/"],a.kc-link');
  const article =
    target.closest<HTMLElement>(".kc-article") ??
    summary?.querySelector<HTMLElement>(".kc-article") ??
    reveal?.querySelector<HTMLElement>(".ko-face-front .kc-article");
  const root = article ?? linked;
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
  const copyId = linkUrl?.searchParams.get("copy") ?? pageCopy;
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
