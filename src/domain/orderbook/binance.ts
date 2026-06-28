import type { MarketSelection } from "../exchanges";
import type { OrderBook, OrderBookProvider } from "./types";
import { safeJson, toLevelsFromPairs } from "./util";

// Binance.US partial-depth stream sends a full top-20 snapshot every message,
// already sorted (bids desc, asks asc) — no delta bookkeeping needed.
export function parseBinanceDepth(raw: string, depth: number): OrderBook | null {
  const msg = safeJson(raw);
  if (!msg || (!msg.bids && !msg.asks)) return null;
  return {
    bids: toLevelsFromPairs(msg.bids).slice(0, depth),
    asks: toLevelsFromPairs(msg.asks).slice(0, depth),
  };
}

export const binanceBookProvider: OrderBookProvider = {
  id: "binance",
  feed: (sel: MarketSelection) => ({
    url: `wss://stream.binance.us:9443/ws/${`${sel.base}${sel.quote}`.toLowerCase()}@depth20@100ms`,
  }),
  createReducer: (depth) => (raw) => parseBinanceDepth(raw, depth),
};
