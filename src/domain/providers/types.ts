import type { Asset, Candle, Quote, Timeframe, TradeTick } from "../types";
import type { ExchangeId } from "../exchanges";

export type CandlePageRequest = {
  base: Asset;
  quote: Quote;
  timeframe: Timeframe;
  endTimeMs?: number; // exclusive upper bound; omit for latest
  limit: number;
};

// A page of historical trades, used to seed seconds candles on venues that
// have no sub-minute klines. Batches walk backward in time: `cursor` is the
// opaque token to fetch the next-older batch, or null when history is exhausted.
export type TradeBatch = {
  trades: TradeTick[]; // ascending by timestamp
  cursor: number | null;
};

export interface CandleProvider {
  id: ExchangeId;
  pageLimit: number;
  supports(timeframe: Timeframe): boolean;
  fetchCandlePage(req: CandlePageRequest, signal: AbortSignal): Promise<Candle[]>;
  // Optional trade backfill for sub-minute history. cursor=null on the first
  // call returns the most recent batch; pass the returned cursor to go older.
  fetchTrades?(
    base: Asset,
    quote: Quote,
    cursor: number | null,
    signal: AbortSignal,
  ): Promise<TradeBatch>;
}
