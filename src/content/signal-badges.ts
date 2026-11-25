import type { Settings } from "../shared/types";
import { overlaySalePrice, type CardSignals, type OverlaySettings } from "./card-signals";
import { auctionIcon, cardIcon } from "./icons";
import { el } from "./ui";
import { formatKosmo } from "../kosmora/contracts";
import { enableMarketLink, marketSearchPath } from "./market-links";

export function numberOneIcon() {
  const icon = el("span", "number-one", "#1");
  icon.title = "Number one copy";
  return icon;
}

export function auctionBidSuffix(bids?: number) {
  if (!bids || bids < 0) return "";
  return " - " + bids.toLocaleString() + (bids === 1 ? " bid" : " bids");
}

export function highlightOwnPrice(badge: HTMLElement, listing?: { soleOwnListing?: true }, stale = false) {
  const own = !!listing?.soleOwnListing && !stale;
  badge.toggleAttribute("data-sole-own-listing", own);
  return own ? " Yours is the only active auction for this finish." : "";
}

export const MARKET_BADGE_CSS = `.price-badge.auction .amount{white-space:nowrap}.number-one{display:inline-block;flex:none;border-radius:3px;padding:1px 3px;background:#f5cd68;color:#382707;font:bold 10px/1.2 system-ui;white-space:nowrap}.sale{background:#171027ed;border-color:#b6955a;color:#f4d68c}.auction{background:#8d2034ed;border-color:#ff7185;color:#fff1f3}.auction[data-sole-own-listing]{background:#145834;border-color:#57ed8c;color:white}.history{background:#21182fed;border-color:#9a7fc6;color:#d1b7fc}[data-stale-price]{opacity:.72}`;
export const SIGNAL_BADGE_CSS = `${MARKET_BADGE_CSS}.signal-badge.quest{display:inline-flex;align-items:center;justify-content:center;width:auto;padding:0 6px;gap:4px;border-radius:6px;white-space:nowrap;background:#f4d68c;border-color:#b6955a;color:#171027}.signal-badge.friend{background:#171027ed;border-color:#9a7fc6;color:#d1b7fc}.friend-trigger{pointer-events:auto;cursor:pointer;padding:0;font:inherit}.friend-trigger:hover{filter:brightness(1.2)}.friend-trigger:focus-visible{outline:2px solid #e7cb84;outline-offset:2px}`;

export function signalBadges(
  signals: CardSignals,
  settings: OverlaySettings & Pick<Settings, "showAuctionBidCounts" | "useMedianOverlayPrice">,
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
    stale?: boolean,
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
    const bids = kind === "auction" && settings.showAuctionBidCounts
      ? auctionBidSuffix(signals.lowestListing?.bids)
      : "";
    const description =
      price !== undefined
        ? `${label}. ${kind === "sale" ? (settings.useMedianOverlayPrice ? "Median" : "Last sale") : "Lowest observed auction price"}: ${formatKosmo(price)} Kosmo${bids}, for this finish.`
        : label + bids;
    const accessibleDescription =
      badge instanceof HTMLAnchorElement
        ? `${description} Find ${marketName} at Market.`
        : description;
    const detail =
      accessibleDescription +
      (kind === "auction" && price !== undefined ? highlightOwnPrice(badge, signals.lowestListing, stale) : "") +
      (stale ? " Last known price." : "") +
      (kind === "auction" && signals.auctionFetchedAt
        ? " Snapshot fetched " +
          new Date(signals.auctionFetchedAt).toLocaleTimeString() +
          ". Provider prices are delayed five minutes."
        : "");
    badge.setAttribute("aria-label", detail);
    badge.title = detail;
    badge.toggleAttribute("data-stale-price", !!stale);
    if (kind === "friend") onFriendBadge?.(badge);
    badge.append(kind === "auction" ? auctionIcon(bids ? signals.lowestListing?.bids : undefined) : cardIcon(kind));
    if (kind === "quest") badge.append(el("span", "badge-label", "Quest"));
    if (price !== undefined) {
      badge.classList.add("with-price");
      badge.append(el("span", "badge-price", `$${formatKosmo(price)}`));
    }
    if (kind === "sale" && !settings.useMedianOverlayPrice && price !== undefined && signals.lastSale?.numberOne) {
      badge.append(numberOneIcon());
      badge.title += " #1 copy.";
      badge.setAttribute("aria-label", badge.title);
    }
    badges.push(badge);
  };
  if (settings.showActiveAuctionsOverlay && signals.activeAuctions)
    icon(
      "auction",
      "Active auctions on the market",
      showPrices && settings.showLowestListingPriceOverlay
        ? signals.lowestListing?.price
        : undefined,
      showPrices && signals.staleListingPrice,
    );
  if (settings.showSaleHistoryOverlay && signals.saleHistory)
    icon(
      "sale",
      "Completed sales in the last 30 days",
      showPrices && settings.showLastSalePriceOverlay
        ? overlaySalePrice(signals, settings.useMedianOverlayPrice)
        : undefined,
      showPrices && signals.staleLastSale,
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
