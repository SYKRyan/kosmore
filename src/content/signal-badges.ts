import type { CardSignals, OverlaySettings } from "./card-signals";
import { cardIcon } from "./icons";
import { el } from "./ui";

export function signalBadges(signals: CardSignals, settings: OverlaySettings) {
  const badges: HTMLElement[] = [];
  if (!settings.cardOverlaysEnabled) return badges;
  const icon = (
    kind: "auction" | "sale" | "friend" | "quest",
    label: string,
  ) => {
    const badge = el("span", `signal-badge ${kind}`);
    badge.setAttribute("role", "img");
    badge.setAttribute("aria-label", label);
    badge.title = label;
    badge.append(cardIcon(kind));
    badges.push(badge);
  };
  if (settings.showActiveAuctionsOverlay && signals.activeAuctions)
    icon("auction", "Active auctions on the market");
  if (settings.showSaleHistoryOverlay && signals.saleHistory)
    icon("sale", "Completed sales in the last 30 days");
  if (settings.showQuestOverlay && signals.quest)
    icon("quest", "Part of a quest");
  if (settings.showFriendInterestOverlay && signals.interestedFriends)
    icon(
      "friend",
      `${signals.interestedFriends} ${signals.interestedFriends === 1 ? "friend may" : "friends may"} be interested based on saved families`,
    );
  return badges;
}
