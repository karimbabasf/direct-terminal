import { describe, expect, it } from "vitest";
import { parseBinanceDepth } from "./binance";
import { createCoinbaseBookReducer } from "./coinbase";
import { createKrakenBookReducer } from "./kraken";

describe("parseBinanceDepth", () => {
  it("parses full snapshot pairs into sorted top-of-book levels", () => {
    const raw = JSON.stringify({
      lastUpdateId: 1,
      bids: [["100.5", "2"], ["100.4", "1"]],
      asks: [["100.6", "3"], ["100.7", "1"]],
    });
    const book = parseBinanceDepth(raw, 14);
    expect(book?.bids[0]).toEqual({ price: 100.5, size: 2 });
    expect(book?.asks[0]).toEqual({ price: 100.6, size: 3 });
  });

  it("ignores non-depth messages", () => {
    expect(parseBinanceDepth(JSON.stringify({ ping: 1 }), 14)).toBeNull();
  });
});

describe("createCoinbaseBookReducer", () => {
  it("applies a snapshot then l2update deltas (size 0 removes)", () => {
    const reduce = createCoinbaseBookReducer(14);
    reduce(JSON.stringify({ type: "snapshot", bids: [["100", "1"], ["99", "2"]], asks: [["101", "1"]] }));
    const book = reduce(
      JSON.stringify({ type: "l2update", changes: [["buy", "100", "5"], ["buy", "99", "0"], ["sell", "101", "2"]] }),
    );
    expect(book?.bids).toEqual([{ price: 100, size: 5 }]); // 99 removed
    expect(book?.asks[0]).toEqual({ price: 101, size: 2 });
  });
});

describe("createKrakenBookReducer", () => {
  it("applies a v2 snapshot then update (qty 0 removes)", () => {
    const reduce = createKrakenBookReducer(14);
    reduce(
      JSON.stringify({
        channel: "book",
        type: "snapshot",
        data: [{ symbol: "BTC/USD", bids: [{ price: 100, qty: 1 }], asks: [{ price: 101, qty: 1 }] }],
      }),
    );
    const book = reduce(
      JSON.stringify({
        channel: "book",
        type: "update",
        data: [{ symbol: "BTC/USD", bids: [{ price: 100, qty: 0 }, { price: 99, qty: 3 }], asks: [] }],
      }),
    );
    expect(book?.bids).toEqual([{ price: 99, size: 3 }]); // 100 removed, 99 added
  });
});
