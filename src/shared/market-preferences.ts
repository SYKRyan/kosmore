import { FINISHES, type Finish } from "./types";

export const MARKET_FINISHES_KEY = "kosmore.marketFinishes";

export function parseMarketFinishes(value: unknown): Finish[] {
  if (!Array.isArray(value)) return [...FINISHES];
  const selected = FINISHES.filter((finish) => value.includes(finish));
  return value.length && !selected.length ? [...FINISHES] : selected;
}

export async function readMarketFinishes(): Promise<Finish[]> {
  return parseMarketFinishes(
    (await chrome.storage.local.get(MARKET_FINISHES_KEY))[MARKET_FINISHES_KEY],
  );
}

// Keep rapid checkbox changes in order without rewriting unrelated settings.
let writes: Promise<void> = Promise.resolve();
export function saveMarketFinishes(finishes: Finish[]): Promise<void> {
  const selected = parseMarketFinishes(finishes);
  writes = writes
    .catch(() => {})
    .then(() => chrome.storage.local.set({ [MARKET_FINISHES_KEY]: selected }));
  return writes;
}
