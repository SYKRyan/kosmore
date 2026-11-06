import type { CardSignals, OverlaySettings } from "./card-signals";
import { cardIcon } from "./icons";
import { el } from "./ui";
import { formatKosmo } from "../kosmora/contracts";
import { enableMarketLink, marketSearchPath } from "./market-links";

export const MARKET_BADGE_CSS = `.sale{background:#171027ed;border-color:#b6955a;color:#f4d68c}.auction{background:#8d2034ed;border-color:#ff7185;color:#fff1f3}`;
export const SIGNAL_BADGE_CSS = `${MARKET_BADGE_CSS}.signal-badge.quest{display:inline-flex;align-items:center;justify-content:center;width:auto;padding:0 6px;gap:4px;border-radius:6px;white-space:nowrap;background:#f4d68c;border-color:#b6955a;color:#171027}.signal-badge.friend{background:#171027ed;border-color:#9a7fc6;color:#d1b7fc}.friend-trigger{pointer-events:auto;cursor:pointer;padding:0;font:inherit}.friend-trigger:hover{filter:brightness(1.2)}.friend-trigger:focus-visible{outline:2px solid #e7cb84;outline-offset:2px}`;

export function signalBadges(
  signals: CardSignals,
  settings: OverlaySettings,
  showPrices = false,
  marketName?: string,
  onFriendBadge?: (badge: HTMLElement) => void,
) {
  const badges: HTMLElement[] = [];
  if (!settings.cardOverlaysEnabled) return badges;
  const icon = (
    kind: "auction" | "sale" | "friend" | "quest",
    label: string,
    price?: string,
  ) => {
    const badge =
      kind === "auction" && marketName
        ? el("a", `signal-badge ${kind} market-link`)
        : kind === "friend" && onFriendBadge
          ? el("button", `signal-badge ${kind}`)
          : el("span", `signal-badge ${kind}`);
    if (badge instanceof HTMLAnchorElement) {
      badge.href = marketSearchPath(marketName!);
      enableMarketLink(badge);
    } else if (badge instanceof HTMLButtonElement) badge.type = "button";
    else badge.setAttribute("role", "img");
    const description =
      price !== undefined
        ? `${label}. ${kind === "sale" ? "Last sale" : "Lowest current listing price"}: ${formatKosmo(price)} Kosmo, across all finishes.`
        : label;
    const accessibleDescription =
      badge instanceof HTMLAnchorElement
        ? `${description} Find ${marketName} at Market.`
        : description;
    badge.setAttribute("aria-label", accessibleDescription);
    badge.title = accessibleDescription;
    if (kind === "friend") onFriendBadge?.(badge);
    badge.append(cardIcon(kind));
    if (kind === "quest") badge.append(el("span", "badge-label", "Quest"));
    if (price !== undefined) {
      badge.classList.add("with-price");
      badge.append(el("span", "badge-price", `$${formatKosmo(price)}`));
    }
    badges.push(badge);
  };
  if (settings.showActiveAuctionsOverlay && signals.activeAuctions)
    icon(
      "auction",
      "Active auctions on the market",
      showPrices && settings.showLowestListingPriceOverlay
        ? signals.lowestListingPrice
        : undefined,
    );
  if (settings.showSaleHistoryOverlay && signals.saleHistory)
    icon(
      "sale",
      "Completed sales in the last 30 days",
      showPrices && settings.showLastSalePriceOverlay
        ? signals.lastSale?.price
        : undefined,
    );
  if (settings.showQuestOverlay && signals.quest)
    icon("quest", "Part of a quest");
  if (settings.showFriendInterestOverlay && signals.interestedFriends)
    icon(
      "friend",
      `${signals.interestedFriends} ${signals.interestedFriends === 1 ? "friend may" : "friends may"} be interested based on saved families`,
    );
  return badges;
}
