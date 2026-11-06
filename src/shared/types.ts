export type Finish = "plain" | "veil" | "fullart";
export const FINISHES: Finish[] = ["plain", "veil", "fullart"];
export const FINISH_LABEL: Record<Finish, string> = {
  plain: "Standard",
  veil: "Shiny",
  fullart: "Full art",
};
export interface Variant {
  veil: boolean;
  fullArt: boolean;
}
export interface CardContext {
  subjectId: string;
  copyId?: string;
  name: string;
  variant: Variant;
  surface: "reveal" | "summary" | "viewer" | "page";
  anchor: HTMLElement;
  openingIds: string[];
  entryIndex?: number;
}
export interface Account {
  key: string;
  handle: string;
  currentOpeningId?: string;
}
export interface OwnedCopy {
  id: string;
  subjectId: string;
  state: string;
  auctionId?: string;
  variant: Variant;
  serial?: number;
  acquiredAt?: string;
}
export interface CardInsights {
  subjectId: string;
  name: string;
  rarity: string;
  interested: number | null;
  readership: number | null;
  readershipSource?: string;
  copies: OwnedCopy[];
  families: CardFamily[] | null;
}
export interface CardFamily {
  id: string;
  name: string;
  /** false when this card does not count toward the family's tiers. */
  economic?: false;
}
export interface Friend {
  handle: string;
  key: string;
}
export interface Sale {
  auctionId: string;
  price: string;
  soldAt: string;
  finish: Finish;
}
export interface MarketHistory {
  finish: Finish;
  days: number;
  count: number;
  low: string | null;
  median: string | null;
  high: string | null;
  sales: Sale[];
  complete: boolean;
}
export interface Album {
  id: string;
  name: string;
  items: number;
  contains?: boolean;
  containsCount?: number;
}
export interface AlbumMembership {
  albumId: string;
  contains: boolean;
}
export interface OpeningCard {
  openingId: string;
  slot: number;
  subjectId: string;
  instanceId: string;
  rarity: string;
  variant: Variant;
}
export interface Settings {
  schemaVersion: 1;
  enabled: boolean;
  profileRemindersEnabled: boolean;
  profileRemindersPinned: boolean;
  friendTooltipEnabled: boolean;
  friendHoverDelayMs: number;
  friendDismissDelayMs: number;
  friendTooltipWidth: number;
  friendTooltipHeight: number;
  friendTooltipPosition: import("./popup-layout").PopupPosition | null;
  navigationHotkeysEnabled: boolean;
  cardOverlaysEnabled: boolean;
  salesOverlaysEnabled: boolean;
  showSalesLastSale: boolean;
  salesLastSaleSetsPrice: boolean;
  salesLastSaleAdjustment: number;
  showSalesLowestListing: boolean;
  salesLowestListingSetsPrice: boolean;
  salesLowestListingAdjustment: number;
  statBoxesEnabled: boolean;
  pinnedAlbumsEnabled: boolean;
  closeTooltipWhenAddedToAlbum: boolean;
  applyCloseBehaviorToPinnedTooltips: boolean;
  hoverDelayMs: number;
  dismissDelayMs: number;
  popupWidth: number;
  popupHeight: number;
  popupPosition: import("./popup-layout").PopupPosition | null;
  showSaleHistoryOverlay: boolean;
  showLastSalePriceOverlay: boolean;
  showActiveAuctionsOverlay: boolean;
  showLowestListingPriceOverlay: boolean;
  showOnSaleOverlay: boolean;
  showFriendInterestOverlay: boolean;
  showQuestOverlay: boolean;
  showFusionFamilyOverlay: boolean;
  stats: import("./stat-catalog").StatPreference[];
  hotkeys: import("./hotkeys").Hotkeys;
  pinnedAlbums: Record<string, string[]>;
}
export interface KosmoraClient {
  account(signal?: AbortSignal, fresh?: boolean): Promise<Account>;
  friends(signal?: AbortSignal, fresh?: boolean): Promise<Friend[]>;
  questSubjects(signal?: AbortSignal, fresh?: boolean): Promise<string[]>;
  families(
    signal?: AbortSignal,
    fresh?: boolean,
  ): Promise<import("../kosmora/families").FamilyChoice[]>;
  insights(
    subjectId: string,
    signal?: AbortSignal,
    fresh?: boolean,
  ): Promise<CardInsights>;
  activeAuctions(
    subjectId: string,
    name: string,
    signal?: AbortSignal,
    fresh?: boolean,
  ): Promise<number>;
  lowestListingPrice(
    subjectId: string,
    name: string,
    signal?: AbortSignal,
    fresh?: boolean,
  ): Promise<string | undefined>;
  history(
    subjectId: string,
    finish: Finish,
    signal?: AbortSignal,
    fresh?: boolean,
  ): Promise<MarketHistory>;
  albums(
    subjectId?: string,
    signal?: AbortSignal,
    fresh?: boolean,
  ): Promise<Album[]>;
  resolveCopy(
    context: CardContext,
    copies: OwnedCopy[],
    signal?: AbortSignal,
  ): Promise<OwnedCopy | undefined>;
  add(albumId: string, copy: OwnedCopy, expectedAccount: string): Promise<void>;
  remove(
    albumId: string,
    subjectId: string,
    expectedAccount: string,
  ): Promise<void>;
}
export function messageOf(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The request failed. Please try again.";
}
