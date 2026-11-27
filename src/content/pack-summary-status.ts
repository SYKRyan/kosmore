import labelCss from "./kosmore-label.css?inline";
import { el } from "./ui";

export const PACK_SUMMARY_STATUS_ATTR = "data-kosmore-pack-summary-status";

export function packStar() {
  const star = el("span", "kosmore-star");
  star.setAttribute("aria-hidden", "true");
  star.style.clipPath = "polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%)";
  return star;
}

export function packSummaryStatus(grid: HTMLElement) {
  const host = el("div");
  host.setAttribute(PACK_SUMMARY_STATUS_ATTR, "");
  const style = el(
    "style",
    "",
    labelCss +
      `
    :host { display: block; margin: 0 0 6px; text-align: start; }
    .kosmore-label { display: inline-block; }
    .kosmore-star {
      display: inline-block;
      width: 14px;
      height: 14px;
      margin-inline-end: 5px;
      background: currentColor;
      font-size: inherit;
      vertical-align: calc(0.5cap - 7px);
    }
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
  label.append(packStar(), el("span", "", "KosMore"));
  const status = el("span", "loading");
  status.setAttribute("role", "status");
  host.attachShadow({ mode: "open" }).append(style, label, status);
  let cooldownUntil = 0;

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
      if (loading === host.hasAttribute("data-loading")) return;
      host.toggleAttribute("data-loading", loading);
      if (loading) {
        status.textContent = "Loading card overlays…";
      } else {
        host.removeAttribute("data-cooldown");
        cooldownUntil = 0;
        status.textContent = "";
      }
    },
  };
}
