import type { ExchangeId } from "../exchanges";
import type { OrderBookProvider } from "./types";
import { binanceBookProvider } from "./binance";
import { coinbaseBookProvider } from "./coinbase";
import { krakenBookProvider } from "./kraken";

// Only the US-accessible venues have a depth provider wired.
const PROVIDERS: Partial<Record<ExchangeId, OrderBookProvider>> = {
  binance: binanceBookProvider,
  coinbase: coinbaseBookProvider,
  kraken: krakenBookProvider,
};

export function getOrderBookProvider(id: ExchangeId): OrderBookProvider | undefined {
  return PROVIDERS[id];
}

export type { OrderBook, OrderBookLevel } from "./types";
