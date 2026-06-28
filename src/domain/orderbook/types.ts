import type { ExchangeId, MarketSelection } from "../exchanges";

export type OrderBookLevel = { price: number; size: number };
export type OrderBook = { bids: OrderBookLevel[]; asks: OrderBookLevel[] };

export type BookFeed = { url: string; subscribe?: unknown };

// A reducer holds internal state (for delta venues) and returns the latest
// top-N book on each relevant message, or null if the message isn't a book.
export type BookReducer = (raw: string) => OrderBook | null;

export interface OrderBookProvider {
  id: ExchangeId;
  feed(selection: MarketSelection): BookFeed;
  createReducer(depth: number): BookReducer;
}
