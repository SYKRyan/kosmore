import labelCss from "./kosmore-label.css?inline";
import { el } from "./ui";

export const PACK_SUMMARY_STATUS_ATTR = "data-kosmore-pack-summary-status";

export function packSummaryStatus(grid: HTMLElement) {
  const host = el("div");
  host.setAttribute(PACK_SUMMARY_STATUS_ATTR, "");
  const style = el(
    "style",
    "",
    labelCss +
      `
    :host { display: block; margin: 0 0 6px; text-align: start; }
    .loading { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
    :host(:not([data-loading])) .kosmore-label { color: #86efac; }
    :host([data-cooldown="first"]) .kosmore-label { color: #fdba74; }
    :host([data-cooldown="repeated"]) .kosmore-label { color: #fca5a5; }
    :host([data-loading]) .kosmore-star { animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) {
      :host([data-loading]) .kosmore-star { animation: none; }
    }
  `,
  );
  const label = el("span", "kosmore-label");
  const icon = el("span", "kosmore-star", "✦");
  icon.setAttribute("aria-hidden", "true");
  label.append(icon, el("span", "", "KosMore"));
  const status = el("span", "loading");
  status.setAttribute("role", "status");
  host.attachShadow({ mode: "open" }).append(style, label, status);
  let settling: object | undefined;
  let cooldownUntil = 0;

  async function settle(token: object) {
    // Wait for Kosmora's staggered entrance animations on the grid items.
    const entrances = [...grid.children].flatMap((card) =>
      card
        .getAnimations()
        .filter(
          (animation) =>
            animation instanceof CSSAnimation &&
            (animation.playState === "running" || animation.pending) &&
            Number.isFinite(animation.effect?.getComputedTiming().endTime),
        ),
    );
    await Promise.allSettled(entrances.map((animation) => animation.finished));
    // Give the final overlays a paint before removing the loading state.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (settling !== token) return;
        settling = undefined;
        host.removeAttribute("data-loading");
        host.removeAttribute("data-cooldown");
        cooldownUntil = 0;
        status.textContent = "";
      }),
    );
  }

  return {
    grid,
    host,
    rateLimited(retryAt: number, startedAt = 0) {
      if (!host.hasAttribute("data-loading") || retryAt <= cooldownUntil)
        return;
      // Requests already in flight when the queue paused share the first cooldown.
      const repeated =
        (cooldownUntil > 0 && startedAt >= cooldownUntil) ||
        host.dataset.cooldown === "repeated";
      cooldownUntil = retryAt;
      host.dataset.cooldown = repeated ? "repeated" : "first";
      status.textContent = repeated
        ? "Rate limited again. Waiting to retry card overlays…"
        : "Rate limited. Waiting to retry card overlays…";
    },
    setLoading(loading: boolean) {
      if (loading) {
        settling = undefined;
        if (host.hasAttribute("data-loading")) return;
        host.setAttribute("data-loading", "");
        status.textContent = "Loading card overlays…";
      } else if (host.hasAttribute("data-loading") && !settling) {
        const token = (settling = {});
        void settle(token);
      }
    },
  };
}
