import type { DiscountMode, SaleRarity } from "./sales-prices";

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
  numberOne?: boolean;
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
  lockedInAlbum?: boolean;
  exclusive?: boolean;
  inTrade?: boolean;
  variant: Variant;
  serial?: number;
  numberOne?: boolean;
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
  copiesKnown?: boolean;
  onSale?: boolean;
  questMember?: boolean;
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
export interface AuctionPrice {
  price: string;
  bids?: number;
}
export interface MarketSale {
  price: string;
  soldAt: string;
  finish: Finish;
  numberOne?: boolean;
}
export interface Sale extends MarketSale {
  auctionId: string;
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
  lastSale?: MarketSale;
  daily?: {
    day: string;
    count: number;
    low: string;
    median: string;
    high: string;
  }[];
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
  disableHoverTooltipInPulsar: boolean;
  disableHoverTooltipInVortex: boolean;
  useOverlayButtonInsteadOfHover: boolean;
  tooltipTakesFocus: boolean;
  outsideClickClosesTooltipOnly: boolean;
  fullScreenCenteredOnOpen: boolean;
  socialRemindersMasterEnabled: boolean;
  profileRemindersEnabled: boolean;
  profileRemindersPinned: boolean;
  socialRemindersEnabled: boolean;
  socialRemindersPinned: boolean;
  tradeRemindersEnabled: boolean;
  showTradeFamilyBadges: boolean;
  showTradePossibleInterest: boolean;
  tradeRaritySymbols: boolean;
  showTradeNotes: boolean;
  tradeNotesPinned: boolean;
  tradeNotesHoverDelayMs: number;
  tradeNotesDismissDelayMs: number;
  tradeNotesWidth: number;
  tradeNotesHeight: number;
  friendTooltipEnabled: boolean;
  friendHoverDelayMs: number;
  friendDismissDelayMs: number;
  friendTooltipWidth: number;
  friendTooltipHeight: number;
  friendTooltipPosition: import("./popup-layout").PopupPosition | null;
  hotkeysEnabled: boolean;
  navigationHotkeysEnabled: boolean;
  hoverTooltipHotkeysEnabled: boolean;
  packOpeningHotkeysEnabled: boolean;
  anyKeyDismissesFoundPack: boolean;
  autoSkipOpening: boolean;
  autoDismissFoundPack: boolean;
  showRemainingPackCount: boolean;
  cardOverlaysEnabled: boolean;
  disableCardOverlaysInPulsar: boolean;
  disableCardOverlaysInVortex: boolean;
  salesOverlaysEnabled: boolean;
  showSalesLastSale: boolean;
  salesLastSaleSetsPrice: boolean;
  salesLastSaleAdjustment: number;
  showSalesLowestListing: boolean;
  salesLowestListingSetsPrice: boolean;
  salesLowestListingAdjustment: number;
  showSalesMyLastListing: boolean;
  salesMyLastListingSetsPrice: boolean;
  salesMyLastListingAdjustment: number;
  salesDiscountEnabled: boolean;
  salesDiscountAmount: number;
  salesDiscountMode: DiscountMode;
  salesDiscountThreshold: number;
  salesCustomMinimumsEnabled: boolean;
  salesCustomMinimums: Record<SaleRarity, number>;
  salesQuickPricesEnabled: boolean;
  salesQuickPrices: number[];
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
  showAuctionBidCounts: boolean;
  showOnSaleOverlay: boolean;
  showFriendInterestOverlay: boolean;
  showQuestOverlay: boolean;
  familyImpactOverlaysEnabled: boolean;
  useFamilyBlacklist: boolean;
  familyBlacklist: string[];
  showSalesFamilyOverlay: boolean;
  showFusionFamilyOverlay: boolean;
  showTradeFamilyOverlay: boolean;
  showVortexFamilyOverlay: boolean;
  stats: import("./stat-catalog").StatPreference[];
  hotkeys: import("./hotkeys").Hotkeys;
  packOpeningHotkeys: import("./hotkeys").Hotkeys<
    import("./hotkeys").PackOpeningId
  >;
  hoverTooltipHotkeys: import("./hotkeys").Hotkeys<
    import("./hotkeys").HoverTooltipId
  >;
  pinnedAlbums: Record<string, string[]>;
  pinnedAlbumHotkeys: import("./hotkeys").PinnedAlbumHotkeys;
}
export interface KosmoraClient {
  saleStatus?(id: string): boolean | undefined;
  observeCardIds?(ids: string[]): void;
  readonly displayAccount?: Account;
  hasInteractiveReads?(): boolean;
  hasActiveAuctions?(
    id: string,
    finish: Finish,
    signal?: AbortSignal,
    onMatch?: () => void,
  ): Promise<boolean>;
  hasSaleHistory?(
    id: string,
    finish: Finish,
    signal?: AbortSignal,
  ): Promise<boolean>;
  peekAuction?(
    id: string,
    finish: Finish,
  ):
    | {
        until: number;
        stale: boolean;
        fetchedAt?: number;
        value: { count: number; lowestListing?: AuctionPrice };
      }
    | undefined;
  peekHistory?(
    id: string,
    finish: Finish,
  ): { until: number; stale: boolean; value: MarketHistory } | undefined;
  cachedListings(
    id: string,
    signal?: AbortSignal,
    cacheOnly?: boolean,
  ): Promise<import("../kosmora/my-listings").TrackedListingHistory>;
  latestListing(
    id: string,
    signal?: AbortSignal,
  ): Promise<import("../kosmora/my-listings").TrackedListing | undefined>;
  discountListingPrice(
    subject: string,
    copyId: string,
    threshold: number,
    listings: import("../kosmora/my-listings").TrackedListing[],
    signal: AbortSignal,
  ): Promise<string | undefined>;
  possibleInterest(
    familyIds: string[],
    signal?: AbortSignal,
    fresh?: boolean,
  ): Promise<import("../kosmora/trade-interest").InterestCounts>;
  verifiedCopy(
    subject: string,
    copyId: string,
    expectedAccount: string,
  ): Promise<OwnedCopy>;
  account(signal?: AbortSignal, fresh?: boolean): Promise<Account>;
  friends(signal?: AbortSignal, fresh?: boolean): Promise<Friend[]>;
  families(
    signal?: AbortSignal,
    fresh?: boolean,
  ): Promise<import("../kosmora/families").FamilyChoice[]>;
  insights(
    subjectId: string,
    signal?: AbortSignal,
    fresh?: boolean,
    includeMyListings?: boolean,
  ): Promise<CardInsights>;
  activeAuctions(
    subjectId: string,
    finish: Finish,
    signal?: AbortSignal,
    fresh?: boolean,
    onMatch?: () => void,
  ): Promise<number>;
  lowestListing(
    subjectId: string,
    finish: Finish,
    signal?: AbortSignal,
    fresh?: boolean,
  ): Promise<AuctionPrice | undefined>;
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
  tooltipCopies(
    context: CardContext,
    account: string,
    pinnedAlbums: boolean,
    signal?: AbortSignal,
  ): Promise<{ copies?: OwnedCopy[]; chosen?: OwnedCopy; problem?: string }>;
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
