import { describe, expect, it } from "vitest";
import { krakenCandleProvider, krakenPair, parseKrakenOhlc } from "./kraken";

const SAMPLE = {
  error: [],
  result: {
    XXBTZUSD: [
      [1700000000, "100", "110", "90", "105", "101", "12.5", 30],
      [1700000060, "105", "120", "104", "118", "110", "8.0", 22],
    ],
    last: 1700000060,
  },
};

describe("parseKrakenOhlc", () => {
  it("reads result[pair] into ascending candles, ignoring `last`", () => {
    const out = parseKrakenOhlc(SAMPLE);
    expect(out.map((c) => c.time)).toEqual([1700000000, 1700000060]);
    expect(out[1]).toEqual({ time: 1700000060, open: 105, high: 120, low: 104, close: 118, volume: 8.0 });
  });
});

describe("krakenPair", () => {
  it("maps BTC to XBT", () => {
    expect(krakenPair("BTC", "USD")).toBe("XBTUSD");
    expect(krakenPair("ETH", "USD")).toBe("ETHUSD");
  });
});

describe("krakenCandleProvider", () => {
  it("supports minute frames, not seconds frames", () => {
    expect(krakenCandleProvider.supports("1m")).toBe(true);
    expect(krakenCandleProvider.supports("1s")).toBe(false);
  });
});
