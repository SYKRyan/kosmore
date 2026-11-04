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
  hoverDelayMs: number;
  pinnedAlbums: Record<string, string[]>;
}
export interface KosmoraClient {
  account(signal?: AbortSignal, fresh?: boolean): Promise<Account>;
  insights(
    subjectId: string,
    signal?: AbortSignal,
    fresh?: boolean,
  ): Promise<CardInsights>;
  history(
    subjectId: string,
    finish: Finish,
    signal?: AbortSignal,
    fresh?: boolean,
  ): Promise<MarketHistory>;
  albums(subjectId?: string, signal?: AbortSignal): Promise<Album[]>;
  resolveCopy(
    context: CardContext,
    copies: OwnedCopy[],
    signal?: AbortSignal,
  ): Promise<OwnedCopy | undefined>;
  add(albumId: string, copy: OwnedCopy, expectedAccount: string): Promise<void>;
}
export function messageOf(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The request failed. Please try again.";
}
