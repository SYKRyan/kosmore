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
        status.textContent = "";
      }),
    );
  }

  return {
    grid,
    host,
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
