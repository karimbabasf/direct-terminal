import { describe, expect, it } from "vitest";
import { fetchHistoryWindow, mergeDedupeSort, prependCandles } from "./paginate";
import type { Candle } from "./types";
import type { CandleProvider } from "./providers/types";

const c = (time: number, close = 1): Candle =>
  ({ time: time as Candle["time"], open: 1, high: 1, low: 1, close, volume: 1 });

describe("mergeDedupeSort", () => {
  it("sorts ascending and removes duplicate timestamps (last wins)", () => {
    const out = mergeDedupeSort([c(3), c(1), c(2), c(2, 99)]);
    expect(out.map((x) => x.time)).toEqual([1, 2, 3]);
    expect(out.find((x) => x.time === 2)?.close).toBe(99);
  });
});

describe("prependCandles", () => {
  it("merges an older page in front while staying ascending-unique", () => {
    const existing = [c(10), c(11), c(12)];
    const older = [c(8), c(9), c(10, 5)]; // 10 overlaps the boundary
    const out = prependCandles(existing, older);
    expect(out.map((x) => x.time)).toEqual([8, 9, 10, 11, 12]);
    expect(out.find((x) => x.time === 10)?.close).toBe(1); // existing wins on overlap
  });
});

// A mock provider with `total` synthetic bars at 60s spacing.
function mockProvider(total: number, pageLimit = 1000): CandleProvider {
  const base = 1_700_000_000;
  const all = Array.from({ length: total }, (_, i) => c(base + i * 60));
  return {
    id: "binance",
    pageLimit,
    supports: () => true,
    async fetchCandlePage(req) {
      const endSec = req.endTimeMs ? Math.floor(req.endTimeMs / 1000) : Infinity;
      const older = all.filter((x) => x.time <= endSec);
      return older.slice(Math.max(0, older.length - Math.min(req.limit, pageLimit)));
    },
  };
}

describe("fetchHistoryWindow", () => {
  it("paginates backward until it reaches the target", async () => {
    const out = await fetchHistoryWindow(
      mockProvider(5000, 1000), "BTC", "USDT", "1m", 3000, new AbortController().signal,
    );
    expect(out.length).toBeGreaterThanOrEqual(3000);
    for (let i = 1; i < out.length; i++) expect(out[i].time).toBeGreaterThan(out[i - 1].time);
  });

  it("stops cleanly when the venue is exhausted", async () => {
    const out = await fetchHistoryWindow(
      mockProvider(400, 1000), "BTC", "USDT", "1m", 10000, new AbortController().signal,
    );
    expect(out).toHaveLength(400);
  });
});
