import type { MarketSelection } from "../exchanges";
import type { BookReducer, OrderBookProvider } from "./types";
import { applyPair, asArr, safeJson, topLevels } from "./util";

// Coinbase Exchange level2_batch: a snapshot, then l2update deltas
// (changes = [side, price, size]; size "0" removes the level).
export function createCoinbaseBookReducer(depth: number): BookReducer {
  const bids = new Map<number, number>();
  const asks = new Map<number, number>();
  return (raw) => {
    const msg = safeJson(raw);
    if (!msg) return null;
    if (msg.type === "snapshot") {
      bids.clear();
      asks.clear();
      for (const row of asArr(msg.bids)) {
        const a = asArr(row);
        applyPair(bids, a[0], a[1]);
      }
      for (const row of asArr(msg.asks)) {
        const a = asArr(row);
        applyPair(asks, a[0], a[1]);
      }
    } else if (msg.type === "l2update") {
      for (const change of asArr(msg.changes)) {
        const a = asArr(change); // [side, price, size]
        applyPair(a[0] === "buy" ? bids : asks, a[1], a[2]);
      }
    } else {
      return null;
    }
    return { bids: topLevels(bids, "bid", depth), asks: topLevels(asks, "ask", depth) };
  };
}

export const coinbaseBookProvider: OrderBookProvider = {
  id: "coinbase",
  feed: (sel: MarketSelection) => ({
    url: "wss://ws-feed.exchange.coinbase.com",
    subscribe: {
      type: "subscribe",
      product_ids: [`${sel.base}-${sel.quote}`],
      channels: ["level2_batch"],
    },
  }),
  createReducer: (depth) => createCoinbaseBookReducer(depth),
};
