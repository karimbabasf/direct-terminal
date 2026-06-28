import type { Candle, Timeframe } from "../types";
import { httpGetJson } from "../http";
import { num, secFromMs } from "./util";
import { mergeDedupeSort } from "../paginate";
import type { CandleProvider, CandlePageRequest } from "./types";

const GRANULARITY: Partial<Record<Timeframe, number>> = {
  "1m": 60, "5m": 300, "15m": 900, "1h": 3600, "4h": 21600, "1d": 86400,
};

export function parseCoinbaseCandles(payload: unknown): Candle[] {
  if (!Array.isArray(payload)) return [];
  const out: Candle[] = [];
  for (const row of payload) {
    if (!Array.isArray(row)) continue;
    const time = secFromMs(row[0]);
    const low = num(row[1]); const high = num(row[2]);
    const open = num(row[3]); const close = num(row[4]); const volume = num(row[5]);
    if (time === null || open === null || high === null || low === null || close === null || volume === null) continue;
    out.push({ time: time as Candle["time"], open, high, low, close, volume });
  }
  return mergeDedupeSort(out); // input is newest-first
}

export const coinbaseCandleProvider: CandleProvider = {
  id: "coinbase",
  pageLimit: 300,
  supports: (tf) => tf in GRANULARITY,
  async fetchCandlePage(req: CandlePageRequest, signal: AbortSignal): Promise<Candle[]> {
    const granularity = GRANULARITY[req.timeframe];
    if (!granularity) return [];
    const url = new URL(`https://api.exchange.coinbase.com/products/${req.base}-${req.quote}/candles`);
    url.searchParams.set("granularity", String(granularity));
    if (req.endTimeMs) {
      const endSec = Math.floor(req.endTimeMs / 1000);
      const startSec = endSec - granularity * Math.min(req.limit, 300);
      url.searchParams.set("end", new Date(endSec * 1000).toISOString());
      url.searchParams.set("start", new Date(startSec * 1000).toISOString());
    }
    const payload = await httpGetJson<unknown>(url.toString(), signal);
    return parseCoinbaseCandles(payload);
  },
};
