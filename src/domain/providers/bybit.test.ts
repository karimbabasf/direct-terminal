import { describe, expect, it } from "vitest";
import { bybitCandleProvider, parseBybitKlines } from "./bybit";

const SAMPLE = {
  retCode: 0,
  result: {
    list: [
      ["1700000060000", "105", "120", "104", "118", "8.0", "900"],
      ["1700000000000", "100", "110", "90", "105", "12.5", "1200"],
    ],
  },
};

describe("parseBybitKlines", () => {
  it("reverses newest-first into ascending candles in seconds", () => {
    const out = parseBybitKlines(SAMPLE);
    expect(out.map((c) => c.time)).toEqual([1700000000, 1700000060]);
    expect(out[0]).toEqual({ time: 1700000000, open: 100, high: 110, low: 90, close: 105, volume: 12.5 });
  });
  it("returns [] when result.list is missing", () => {
    expect(parseBybitKlines({ result: {} })).toEqual([]);
  });
});

describe("bybitCandleProvider", () => {
  it("supports minute/hour/day frames, not seconds frames", () => {
    expect(bybitCandleProvider.supports("1m")).toBe(true);
    expect(bybitCandleProvider.supports("4h")).toBe(true);
    expect(bybitCandleProvider.supports("1s")).toBe(false);
  });
});
