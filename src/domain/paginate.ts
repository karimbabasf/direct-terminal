import type { Asset, Candle, Quote, Timeframe } from "./types";
import type { CandleProvider } from "./providers/types";

export function mergeDedupeSort(candles: Candle[]): Candle[] {
  const byTime = new Map<number, Candle>();
  for (const candle of candles) {
    byTime.set(candle.time, candle); // later entries overwrite earlier
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

// Older page goes first so that, on a boundary duplicate, the EXISTING bar wins.
export function prependCandles(existing: Candle[], older: Candle[]): Candle[] {
  return mergeDedupeSort([...older, ...existing]);
}

// Walk backward through a provider's pages until we reach targetCount or the
// venue runs dry. The cursor is the oldest bar we hold, minus 1ms (exclusive).
export async function fetchHistoryWindow(
  provider: CandleProvider,
  base: Asset,
  quote: Quote,
  timeframe: Timeframe,
  targetCount: number,
  signal: AbortSignal,
): Promise<Candle[]> {
  let all: Candle[] = [];
  let cursor: number | undefined;
  while (all.length < targetCount) {
    const page = await provider.fetchCandlePage(
      { base, quote, timeframe, endTimeMs: cursor, limit: provider.pageLimit },
      signal,
    );
    if (page.length === 0) break; // exhausted
    all = prependCandles(all, page);
    const nextCursor = all[0].time * 1000 - 1; // ms, exclusive of the oldest we have
    if (cursor !== undefined && nextCursor >= cursor) break; // no-progress guard
    cursor = nextCursor;
    if (page.length < provider.pageLimit) break; // last page from venue
  }
  return all;
}
