import { subjectId, uuid } from "../kosmora/contracts";
import { transferProblem } from "../kosmora/copy-actions";
import { messageOf, type KosmoraClient, type OwnedCopy } from "../shared/types";
import { observePage } from "./page-changes";
import { el } from "./ui";

const GIFT_HASH = "#kosmore-gift";
const GIFT_INTENT = "kosmore.giftIntent";
const GIFT_BUTTON =
  'button[data-testid="card-gift"], button.cd-act:has(svg.gicon path[d="M2.5 9h19v-3.5h-19Z"])';

export function giftPath(copy: OwnedCopy, accountKey: string) {
  const id = subjectId(copy.subjectId);
  const instance = uuid(copy.id);
  try {
    sessionStorage.setItem(
      GIFT_INTENT,
      JSON.stringify({
        id,
        instance,
        accountKey,
        expires: Date.now() + 30_000,
      }),
    );
  } catch {
    // The destination still provides the native Send control if storage is unavailable.
  }
  return `/card/${id}?copy=${instance}${GIFT_HASH}`;
}

export function startGiftHandoff(client: KosmoraClient) {
  let active: AbortController | undefined;
  const attempt = async () => {
    if (location.hash !== GIFT_HASH || !/^\/card\/\d+$/.test(location.pathname))
      return;
    active?.abort();
    const request = new AbortController();
    active = request;
    const signal = AbortSignal.any([
      request.signal,
      AbortSignal.timeout(15_000),
    ]);
    const destination = location.pathname + location.search;
    history.replaceState(history.state, "", destination);
    const stillHere = () =>
      !request.signal.aborted &&
      location.pathname + location.search === destination &&
      !location.hash;

    try {
      const stored = sessionStorage.getItem(GIFT_INTENT);
      sessionStorage.removeItem(GIFT_INTENT);
      const intent = stored ? JSON.parse(stored) : null;
      if (
        !intent ||
        intent.expires < Date.now() ||
        destination !== `/card/${intent.id}?copy=${intent.instance}`
      )
        throw new Error(
          "The Gift shortcut expired. Use Send on this card page.",
        );
      const account = await client.account(signal, true);
      if (account.key !== intent.accountKey)
        throw new Error("Your Kosmora account changed.");
      const card = await client.insights(subjectId(intent.id), signal, true);
      const copy = card.copies.find((item) => item.id === intent.instance);
      if (!copy) throw new Error("You no longer own this copy.");
      const problem = transferProblem(copy, "gift");
      if (problem) throw new Error(problem);
      if (!stillHere()) return;

      await new Promise<void>((resolve, reject) => {
        const finish = () => {
          stop();
          signal.removeEventListener("abort", onAbort);
        };
        const onAbort = () => {
          finish();
          reject(
            new Error("Use Send on this card page when it becomes available."),
          );
        };
        const open = () => {
          if (!stillHere()) {
            finish();
            resolve();
            return;
          }
          const buttons = [
            ...document.querySelectorAll<HTMLButtonElement>(GIFT_BUTTON),
          ].filter(
            (button) =>
              button.closest("main .cd-actions") &&
              !button.disabled &&
              !button.closest("[hidden], [inert]") &&
              button.getClientRects().length > 0 &&
              getComputedStyle(button).visibility === "visible",
          );
          if (buttons.length !== 1) return;
          finish();
          buttons[0].click();
          resolve();
        };
        const stop = observePage(open);
        signal.addEventListener("abort", onAbort, { once: true });
        if (signal.aborted) onAbort();
        else open();
      });
    } catch (error) {
      if (!stillHere()) return;
      const notice = el("p", "", `Could not open Gift. ${messageOf(error)}`);
      notice.setAttribute("role", "status");
      notice.style.cssText =
        "position:fixed;bottom:16px;right:16px;z-index:10000;max-width:min(26rem,90vw);padding:12px;background:#241936;color:#fff0ce;border-radius:8px";
      document.body.append(notice);
      setTimeout(() => notice.remove(), 10_000);
    }
  };
  window.addEventListener("hashchange", () => void attempt());
  window.addEventListener("pagehide", () => active?.abort());
  void attempt();
}
