import type { Asset, Candle, Quote, Timeframe } from "../types";
import { httpGetJson } from "../http";
import { num } from "./util";
import { mergeDedupeSort } from "../paginate";
import { parseKrakenTrades } from "./trades";
import type { CandleProvider, CandlePageRequest, TradeBatch } from "./types";

const INTERVAL: Partial<Record<Timeframe, string>> = {
  "1m": "1", "5m": "5", "15m": "15", "30m": "30", "1h": "60", "4h": "240", "1d": "1440",
};

export function krakenPair(base: Asset, quote: Quote): string {
  const b = base === "BTC" ? "XBT" : base;
  return `${b}${quote}`;
}

export function parseKrakenOhlc(payload: unknown): Candle[] {
  const result = (payload as { result?: Record<string, unknown> })?.result;
  if (!result) return [];
  const rows = Object.entries(result).find(([key]) => key !== "last")?.[1];
  if (!Array.isArray(rows)) return [];
  const out: Candle[] = [];
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    const time = num(row[0]);
    const open = num(row[1]); const high = num(row[2]);
    const low = num(row[3]); const close = num(row[4]); const volume = num(row[6]);
    if (time === null || open === null || high === null || low === null || close === null || volume === null) continue;
    out.push({ time: Math.floor(time) as Candle["time"], open, high, low, close, volume });
  }
  return mergeDedupeSort(out);
}

export const krakenCandleProvider: CandleProvider = {
  id: "kraken",
  pageLimit: 720,
  supports: (tf) => tf in INTERVAL,
  async fetchCandlePage(req: CandlePageRequest, signal: AbortSignal): Promise<Candle[]> {
    const interval = INTERVAL[req.timeframe];
    if (!interval) return [];
    // Kraken `since` is forward-only; we cannot deep-paginate backward.
    // Once we already hold the recent window (endTimeMs set), stop.
    if (req.endTimeMs) return [];
    const url = new URL("https://api.kraken.com/0/public/OHLC");
    url.searchParams.set("pair", krakenPair(req.base, req.quote));
    url.searchParams.set("interval", interval);
    const payload = await httpGetJson<unknown>(url.toString(), signal);
    return parseKrakenOhlc(payload);
  },
  async fetchTrades(base, quote, cursor, signal): Promise<TradeBatch> {
    // Kraken's `since` is forward-only, so there is no backward pagination:
    // a single recent batch seeds the chart, then live trades take over.
    if (cursor !== null) return { trades: [], cursor: null };
    const url = new URL("https://api.kraken.com/0/public/Trades");
    url.searchParams.set("pair", krakenPair(base, quote));
    const payload = await httpGetJson<unknown>(url.toString(), signal);
    const { trades } = parseKrakenTrades(payload, base, quote);
    return { trades, cursor: null };
  },
};
