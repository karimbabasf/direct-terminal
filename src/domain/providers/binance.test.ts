import { describe, expect, it } from "vitest";
import { binanceCandleProvider, parseBinanceKlines } from "./binance";

// [ openTime(ms), open, high, low, close, volume, closeTime, ... ]
const SAMPLE = [
  [1700000000000, "100.0", "110.0", "90.0", "105.0", "12.5", 1700000059999],
  [1700000060000, "105.0", "120.0", "104.0", "118.0", "8.0", 1700000119999],
];

describe("parseBinanceKlines", () => {
  it("maps rows to ascending candles in seconds", () => {
    const out = parseBinanceKlines(SAMPLE);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ time: 1700000000, open: 100, high: 110, low: 90, close: 105, volume: 12.5 });
    expect(out[1].close).toBe(118);
  });
  it("returns [] for non-array input", () => {
    expect(parseBinanceKlines({})).toEqual([]);
  });
});

describe("binanceCandleProvider", () => {
  it("supports standard frames but not 5s/15s/30s", () => {
    expect(binanceCandleProvider.supports("1m")).toBe(true);
    expect(binanceCandleProvider.supports("1s")).toBe(true);
    expect(binanceCandleProvider.supports("15s")).toBe(false);
  });
});
