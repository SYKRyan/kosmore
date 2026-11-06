import { handleKey, type SocialFriend } from "./social";

export interface ProfilePlayer extends SocialFriend {
  heading: HTMLElement;
}

/** Require the rendered profile identity to agree with the route during SPA navigation. */
export function profilePlayer(doc: Document = document): ProfilePlayer | null {
  const handle = doc.location.pathname.match(
    /^\/u\/([a-z0-9_]{1,24})\/?$/i,
  )?.[1];
  const heading = doc.querySelector<HTMLElement>("main .pf-banner .pf-name");
  const panel = heading?.closest<HTMLElement>(".pf-banner");
  if (
    !handle ||
    !heading ||
    !panel ||
    !panel.parentElement?.matches(".pf") ||
    panel.closest('[hidden],[aria-hidden="true"],[inert]') ||
    heading.textContent?.trim().toLowerCase() !== handleKey(handle)
  )
    return null;
  let accountHint: string | undefined;
  const href = doc.querySelector('.rail a[href*="/u/"]')?.getAttribute("href");
  if (href) {
    try {
      const url = new URL(href, doc.location.href);
      const own =
        url.origin === doc.location.origin &&
        url.pathname.match(/^\/u\/([a-z0-9_]{1,24})$/i)?.[1];
      if (own) accountHint = handleKey(own);
    } catch {
      /* An invalid navigation link cannot establish an account hint. */
    }
  }
  return { handle, key: handleKey(handle), heading, panel, accountHint };
}
