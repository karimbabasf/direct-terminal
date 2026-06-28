import type { ExchangeId } from "../exchanges";
import type { CandleProvider } from "./types";
import { binanceCandleProvider } from "./binance";
import { bybitCandleProvider } from "./bybit";
import { okxCandleProvider } from "./okx";
import { coinbaseCandleProvider } from "./coinbase";
import { krakenCandleProvider } from "./kraken";

const CANDLE_PROVIDERS: Record<ExchangeId, CandleProvider> = {
  binance: binanceCandleProvider,
  bybit: bybitCandleProvider,
  okx: okxCandleProvider,
  coinbase: coinbaseCandleProvider,
  kraken: krakenCandleProvider,
};

export function getCandleProvider(id: ExchangeId): CandleProvider {
  return CANDLE_PROVIDERS[id];
}

export type { CandleProvider, CandlePageRequest } from "./types";
