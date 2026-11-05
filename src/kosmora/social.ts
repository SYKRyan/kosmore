export const FRIEND_REMINDERS_ID = "kosmore-friend-reminders";
export interface SocialFriend {
  panel: HTMLElement;
  handle: string;
  key: string;
  accountHint?: string;
}
export function handleKey(handle: string): string {
  if (!/^[a-z0-9_]{1,24}$/i.test(handle))
    throw new Error("Invalid player handle.");
  return handle.toLowerCase();
}
function linkHandle(link: Element | null, pattern: RegExp, doc: Document) {
  const href = link?.getAttribute("href");
  if (!href) return undefined;
  try {
    const url = new URL(href, doc.location.href);
    return url.origin === doc.location.origin
      ? url.pathname.match(pattern)?.[1]
      : undefined;
  } catch {
    return undefined;
  }
}
export function selectedSocialFriend(
  doc: Document = document,
): SocialFriend | null {
  const url = new URL(doc.location.href);
  if (url.pathname !== "/social" || url.searchParams.get("v")) return null;
  const panel = doc.querySelector<HTMLElement>(
    '[data-testid="sb-friend-card"]',
  );
  if (!panel || panel.closest('[hidden],[aria-hidden="true"]')) return null;
  // Both native links must identify the same friend; history rows are deliberately excluded.
  const handle = linkHandle(
    panel.querySelector('.sb-links a[href*="/friends/"]'),
    /^\/friends\/([a-z0-9_]{1,24})\/collection$/i,
    doc,
  );
  const profile = linkHandle(
    panel.querySelector('.sb-links a[href*="/u/"]'),
    /^\/u\/([a-z0-9_]{1,24})$/i,
    doc,
  );
  if (!handle || !profile || handleKey(handle) !== handleKey(profile))
    return null;
  const selected = url.searchParams.get("f");
  if (
    selected &&
    (!/^[a-z0-9_]{1,24}$/i.test(selected) ||
      handleKey(selected) !== handleKey(handle))
  )
    return null;
  const ownHandle = linkHandle(
    doc.querySelector('.rail a[href*="/u/"]'),
    /^\/u\/([a-z0-9_]{1,24})$/i,
    doc,
  );
  return {
    panel,
    handle,
    key: handleKey(handle),
    accountHint: ownHandle ? handleKey(ownHandle) : undefined,
  };
}
