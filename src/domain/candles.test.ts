import { describe, expect, it } from "vitest";
import {
  advanceCandles,
  applyTradeToCandles,
  tradesToCandles,
} from "./candles";
import type { Candle, TradeTick } from "./types";

const trade = (timestamp: number, price: number, size = 1): TradeTick => ({
  exchange: "test",
  symbol: "BTCUSD",
  price,
  size,
  timestamp,
});

const candle = (time: number, close = 100): Candle => ({
  time: time as Candle["time"],
  open: close,
  high: close,
  low: close,
  close,
  volume: 0,
});

describe("applyTradeToCandles", () => {
  it("opens a new candle and updates the forming one in place", () => {
    let candles: Candle[] = [];
    candles = applyTradeToCandles(candles, trade(1_000, 100), 1_000);
    candles = applyTradeToCandles(candles, trade(1_400, 105), 1_000);
    expect(candles).toHaveLength(1);
    expect(candles[0]).toMatchObject({ time: 1, open: 100, high: 105, close: 105 });
  });

  it("fills empty intervals with flat carry-forward candles when a trade skips ahead", () => {
    // Trade at second 1, then nothing until second 4 — seconds 2 and 3 must
    // still exist as flat candles so the chart has no holes.
    let candles: Candle[] = [];
    candles = applyTradeToCandles(candles, trade(1_000, 100), 1_000);
    candles = applyTradeToCandles(candles, trade(4_000, 110), 1_000);

    expect(candles.map((c) => c.time)).toEqual([1, 2, 3, 4]);
    // Seconds 2 and 3 are flat dojis at the previous close (100), zero volume.
    expect(candles[1]).toMatchObject({ time: 2, open: 100, high: 100, low: 100, close: 100, volume: 0 });
    expect(candles[2]).toMatchObject({ time: 3, close: 100, volume: 0 });
    // Second 4 opens at the new trade price.
    expect(candles[3]).toMatchObject({ time: 4, open: 110, close: 110 });
  });

  it("respects larger timeframes when bucketing (5s)", () => {
    let candles: Candle[] = [];
    candles = applyTradeToCandles(candles, trade(0, 100), 5_000);
    candles = applyTradeToCandles(candles, trade(3_000, 102), 5_000); // same 0-5s bucket
    candles = applyTradeToCandles(candles, trade(7_000, 108), 5_000); // 5-10s bucket
    expect(candles.map((c) => c.time)).toEqual([0, 5]);
    expect(candles[0]).toMatchObject({ open: 100, close: 102 });
    expect(candles[1]).toMatchObject({ time: 5, open: 108 });
  });
});

describe("advanceCandles", () => {
  it("appends flat carry-forward candles up to the current wall-clock bucket", () => {
    const candles = [candle(10, 100)];
    // now is inside second 13 → seconds 11, 12, 13 must be created flat.
    const out = advanceCandles(candles, 1_000, 13_400);
    expect(out.map((c) => c.time)).toEqual([10, 11, 12, 13]);
    expect(out[3]).toMatchObject({ time: 13, open: 100, high: 100, low: 100, close: 100, volume: 0 });
  });

  it("returns the same array reference when no advance is needed", () => {
    const candles = [candle(10, 100)];
    const out = advanceCandles(candles, 1_000, 10_500); // still inside second 10
    expect(out).toBe(candles);
  });

  it("does nothing on an empty series", () => {
    const out = advanceCandles([], 1_000, 10_000);
    expect(out).toEqual([]);
  });
});

describe("tradesToCandles", () => {
  it("aggregates unordered trades into OHLCV buckets with gap-fill", () => {
    const trades = [
      trade(2_500, 105, 2), // second 2
      trade(1_000, 100, 1), // second 1 (open)
      trade(1_900, 103, 1), // second 1
      trade(4_200, 108, 3), // second 4
    ];
    const out = tradesToCandles(trades, 1_000);
    expect(out.map((c) => c.time)).toEqual([1, 2, 3, 4]);
    // Second 1: open 100, high 103, low 100, close 103, vol 2
    expect(out[0]).toMatchObject({ time: 1, open: 100, high: 103, low: 100, close: 103, volume: 2 });
    // Second 2: single trade
    expect(out[1]).toMatchObject({ time: 2, open: 105, close: 105, volume: 2 });
    // Second 3: empty → flat carry-forward at 105
    expect(out[2]).toMatchObject({ time: 3, close: 105, volume: 0 });
    // Second 4
    expect(out[3]).toMatchObject({ time: 4, open: 108, close: 108, volume: 3 });
  });

  it("returns an empty array for no trades", () => {
    expect(tradesToCandles([], 1_000)).toEqual([]);
  });
});
