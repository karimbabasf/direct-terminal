import { describe, expect, it } from "vitest";
import { coinbaseCandleProvider, parseCoinbaseCandles } from "./coinbase";

// [ time(sec), low, high, open, close, volume ]  — newest first
const SAMPLE = [
  [1700000060, 104, 120, 105, 118, 8.0],
  [1700000000, 90, 110, 100, 105, 12.5],
];

describe("parseCoinbaseCandles", () => {
  it("maps low/high/open/close column order into ascending candles", () => {
    const out = parseCoinbaseCandles(SAMPLE);
    expect(out.map((c) => c.time)).toEqual([1700000000, 1700000060]);
    expect(out[0]).toEqual({ time: 1700000000, open: 100, high: 110, low: 90, close: 105, volume: 12.5 });
  });
});

describe("coinbaseCandleProvider", () => {
  it("supports only frames with a fixed granularity", () => {
    expect(coinbaseCandleProvider.supports("1m")).toBe(true);
    expect(coinbaseCandleProvider.supports("1h")).toBe(true);
    expect(coinbaseCandleProvider.supports("3m")).toBe(false); // no 180s granularity
    expect(coinbaseCandleProvider.supports("1s")).toBe(false);
  });
});
