import type { MarketSelection } from "../exchanges";
import type { BookReducer, OrderBookProvider } from "./types";
import { applyPair, asArr, safeJson, topLevels } from "./util";

// Kraken WS v2 book: a snapshot then updates. Levels are { price, qty } objects;
// qty 0 removes. (Checksum validation is skipped — best-effort for a viewer.)
export function createKrakenBookReducer(depth: number): BookReducer {
  const bids = new Map<number, number>();
  const asks = new Map<number, number>();
  return (raw) => {
    const msg = safeJson(raw);
    if (!msg || msg.channel !== "book" || !Array.isArray(msg.data)) return null;
    if (msg.type === "snapshot") {
      bids.clear();
      asks.clear();
    } else if (msg.type !== "update") {
      return null;
    }
    for (const entry of asArr(msg.data)) {
      for (const lvl of asArr(entry.bids)) applyPair(bids, lvl?.price, lvl?.qty);
      for (const lvl of asArr(entry.asks)) applyPair(asks, lvl?.price, lvl?.qty);
    }
    return { bids: topLevels(bids, "bid", depth), asks: topLevels(asks, "ask", depth) };
  };
}

export const krakenBookProvider: OrderBookProvider = {
  id: "kraken",
  feed: (sel: MarketSelection) => ({
    url: "wss://ws.kraken.com/v2",
    subscribe: {
      method: "subscribe",
      params: { channel: "book", symbol: [`${sel.base}/${sel.quote}`], depth: 25 },
    },
  }),
  createReducer: (depth) => createKrakenBookReducer(depth),
};
