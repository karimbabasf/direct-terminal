import type { Candle, Timeframe } from "../types";
import { httpGetJson } from "../http";
import { num, secFromMs } from "./util";
import { mergeDedupeSort } from "../paginate";
import type { CandleProvider, CandlePageRequest } from "./types";

const BAR: Partial<Record<Timeframe, string>> = {
  "1m": "1m", "3m": "3m", "5m": "5m", "15m": "15m", "30m": "30m",
  "1h": "1H", "4h": "4H", "1d": "1D",
};

export function parseOkxCandles(payload: unknown): Candle[] {
  const data = (payload as { data?: unknown })?.data;
  if (!Array.isArray(data)) return [];
  const out: Candle[] = [];
  for (const row of data) {
    if (!Array.isArray(row)) continue;
    const time = secFromMs(row[0]);
    const open = num(row[1]); const high = num(row[2]);
    const low = num(row[3]); const close = num(row[4]); const volume = num(row[5]);
    if (time === null || open === null || high === null || low === null || close === null || volume === null) continue;
    out.push({ time: time as Candle["time"], open, high, low, close, volume });
  }
  return mergeDedupeSort(out); // input is newest-first
}

export const okxCandleProvider: CandleProvider = {
  id: "okx",
  pageLimit: 300,
  supports: (tf) => tf in BAR,
  async fetchCandlePage(req: CandlePageRequest, signal: AbortSignal): Promise<Candle[]> {
    const bar = BAR[req.timeframe];
    if (!bar) return [];
    const url = new URL("https://www.okx.com/api/v5/market/candles");
    url.searchParams.set("instId", `${req.base}-${req.quote}`);
    url.searchParams.set("bar", bar);
    url.searchParams.set("limit", String(Math.min(req.limit, 300)));
    if (req.endTimeMs) url.searchParams.set("after", String(req.endTimeMs));
    const payload = await httpGetJson<unknown>(url.toString(), signal);
    return parseOkxCandles(payload);
  },
};
