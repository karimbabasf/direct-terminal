import type { Candle, Timeframe } from "../types";
import { httpGetJson } from "../http";
import { num, secFromMs } from "./util";
import { mergeDedupeSort } from "../paginate";
import type { CandleProvider, CandlePageRequest } from "./types";

const INTERVAL: Partial<Record<Timeframe, string>> = {
  "1m": "1", "3m": "3", "5m": "5", "15m": "15", "30m": "30",
  "1h": "60", "4h": "240", "1d": "D",
};

export function parseBybitKlines(payload: unknown): Candle[] {
  const list = (payload as { result?: { list?: unknown } })?.result?.list;
  if (!Array.isArray(list)) return [];
  const out: Candle[] = [];
  for (const row of list) {
    if (!Array.isArray(row)) continue;
    const time = secFromMs(row[0]);
    const open = num(row[1]); const high = num(row[2]);
    const low = num(row[3]); const close = num(row[4]); const volume = num(row[5]);
    if (time === null || open === null || high === null || low === null || close === null || volume === null) continue;
    out.push({ time: time as Candle["time"], open, high, low, close, volume });
  }
  return mergeDedupeSort(out); // input is newest-first
}

export const bybitCandleProvider: CandleProvider = {
  id: "bybit",
  pageLimit: 1000,
  supports: (tf) => tf in INTERVAL,
  async fetchCandlePage(req: CandlePageRequest, signal: AbortSignal): Promise<Candle[]> {
    const interval = INTERVAL[req.timeframe];
    if (!interval) return [];
    const url = new URL("https://api.bybit.com/v5/market/kline");
    url.searchParams.set("category", "spot");
    url.searchParams.set("symbol", `${req.base}${req.quote}`);
    url.searchParams.set("interval", interval);
    url.searchParams.set("limit", String(Math.min(req.limit, 1000)));
    if (req.endTimeMs) url.searchParams.set("end", String(req.endTimeMs));
    const payload = await httpGetJson<unknown>(url.toString(), signal);
    return parseBybitKlines(payload);
  },
};
