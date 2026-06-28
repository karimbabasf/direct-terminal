import type { Asset, Candle, Quote, Timeframe } from "../types";
import type { ExchangeId } from "../exchanges";

export type CandlePageRequest = {
  base: Asset;
  quote: Quote;
  timeframe: Timeframe;
  endTimeMs?: number; // exclusive upper bound; omit for latest
  limit: number;
};

export interface CandleProvider {
  id: ExchangeId;
  pageLimit: number;
  supports(timeframe: Timeframe): boolean;
  fetchCandlePage(req: CandlePageRequest, signal: AbortSignal): Promise<Candle[]>;
}
