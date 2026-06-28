import { describe, expect, it } from "vitest";
import {
  parseBinanceAggTrades,
  parseCoinbaseTrades,
  parseKrakenTrades,
  fetchTradeHistory,
} from "./trades";
import type { TradeTick } from "../types";
import type { CandleProvider, TradeBatch } from "./types";

describe("parseCoinbaseTrades", () => {
  it("parses rows ascending and returns the oldest id as the next cursor", () => {
    const rows = [
      { trade_id: 102, side: "buy", size: "0.5", price: "60010.0", time: "2026-06-28T08:39:27.200Z" },
      { trade_id: 101, side: "sell", size: "0.2", price: "60000.0", time: "2026-06-28T08:39:26.100Z" },
    ];
    const { trades, nextCursor } = parseCoinbaseTrades(rows, "BTC", "USD");
    expect(trades.map((t) => t.price)).toEqual([60000, 60010]); // ascending by time
    expect(trades[0]).toMatchObject({ exchange: "coinbase", symbol: "BTC/USD", size: 0.2 });
    expect(trades[0].timestamp).toBe(Date.parse("2026-06-28T08:39:26.100Z"));
    expect(nextCursor).toBe(101); // oldest trade_id
  });

  it("returns a null cursor for empty/garbage payloads", () => {
    expect(parseCoinbaseTrades([], "BTC", "USD")).toEqual({ trades: [], nextCursor: null });
    expect(parseCoinbaseTrades(null, "BTC", "USD")).toEqual({ trades: [], nextCursor: null });
  });
});

describe("parseBinanceAggTrades", () => {
  it("parses agg trades ascending and returns the oldest agg id as cursor", () => {
    const rows = [
      { a: 555, p: "60010.0", q: "0.01", T: 1782589572280, m: false },
      { a: 554, p: "60000.0", q: "0.02", T: 1782589571000, m: true },
    ];
    const { trades, nextCursor } = parseBinanceAggTrades(rows, "BTC", "USDT");
    expect(trades.map((t) => t.timestamp)).toEqual([1782589571000, 1782589572280]);
    expect(trades[1]).toMatchObject({ exchange: "binance", symbol: "BTC/USDT", price: 60010, size: 0.01 });
    expect(nextCursor).toBe(554);
  });
});

describe("parseKrakenTrades", () => {
  it("parses the OHLC-style result map and has no backward cursor", () => {
    const payload = {
      error: [],
      result: {
        XXBTZUSD: [
          ["60000.0", "0.10", 1782634687.76, "b", "l", "", 1],
          ["60010.0", "0.20", 1782634688.91, "s", "m", "", 2],
        ],
        last: "1782634688910000000",
      },
    };
    const { trades, nextCursor } = parseKrakenTrades(payload, "BTC", "USD");
    expect(trades).toHaveLength(2);
    expect(trades[0]).toMatchObject({ exchange: "kraken", symbol: "BTC/USD", price: 60000, size: 0.1 });
    expect(trades[0].timestamp).toBe(1782634687760); // sec → ms
    expect(nextCursor).toBeNull(); // Kraken trades REST cannot paginate backward
  });
});

// A mock provider whose fetchTrades yields `pages` newest-first, each tagged
// with a cursor pointing at the next-older page.
function mockTradeProvider(pages: TradeTick[][]): CandleProvider {
  return {
    id: "coinbase",
    pageLimit: 300,
    supports: () => false,
    async fetchCandlePage() {
      return [];
    },
    async fetchTrades(_base, _quote, cursor): Promise<TradeBatch> {
      const idx = cursor == null ? 0 : cursor;
      const trades = pages[idx] ?? [];
      const hasMore = idx + 1 < pages.length;
      return { trades, cursor: hasMore ? idx + 1 : null };
    },
  };
}

const t = (timestamp: number, price: number): TradeTick => ({
  exchange: "coinbase",
  symbol: "BTC/USD",
  price,
  size: 1,
  timestamp,
});

describe("fetchTradeHistory", () => {
  it("walks backward across pages until the target trade count is met", async () => {
    const provider = mockTradeProvider([
      [t(3000, 30), t(3500, 35)], // newest
      [t(2000, 20), t(2500, 25)],
      [t(1000, 10), t(1500, 15)], // oldest
    ]);
    const out = await fetchTradeHistory(
      provider, "BTC", "USD", { maxPages: 10, targetTrades: 5 }, new AbortController().signal,
    );
    // Ascending overall, no gaps across page boundaries.
    expect(out.map((x) => x.timestamp)).toEqual([1000, 1500, 2000, 2500, 3000, 3500]);
  });

  it("stops when the venue is exhausted before the target", async () => {
    const provider = mockTradeProvider([[t(3000, 30)], [t(2000, 20)]]);
    const out = await fetchTradeHistory(
      provider, "BTC", "USD", { maxPages: 10, targetTrades: 999 }, new AbortController().signal,
    );
    expect(out.map((x) => x.timestamp)).toEqual([2000, 3000]);
  });

  it("respects the page cap", async () => {
    const provider = mockTradeProvider([[t(3000, 30)], [t(2000, 20)], [t(1000, 10)]]);
    const out = await fetchTradeHistory(
      provider, "BTC", "USD", { maxPages: 2, targetTrades: 999 }, new AbortController().signal,
    );
    expect(out.map((x) => x.timestamp)).toEqual([2000, 3000]); // only 2 pages fetched
  });

  it("returns empty when the provider has no trade backfill", async () => {
    const provider: CandleProvider = {
      id: "okx",
      pageLimit: 300,
      supports: () => false,
      async fetchCandlePage() {
        return [];
      },
    };
    const out = await fetchTradeHistory(
      provider, "BTC", "USDT", { maxPages: 5, targetTrades: 10 }, new AbortController().signal,
    );
    expect(out).toEqual([]);
  });
});
