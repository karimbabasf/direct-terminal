import type { Candle, Timeframe } from "../types";
import { httpGetJson } from "../http";
import { num, secFromMs } from "./util";
import { parseBinanceAggTrades } from "./trades";
import type { CandleProvider, CandlePageRequest, TradeBatch } from "./types";

// Binance.US klines do NOT support sub-minute intervals (1s returns HTTP 400
// "Invalid interval"). Seconds candles are seeded from aggTrades instead.
const INTERVAL: Partial<Record<Timeframe, string>> = {
  "1m": "1m", "3m": "3m", "5m": "5m", "15m": "15m",
  "30m": "30m", "1h": "1h", "4h": "4h", "1d": "1d",
};

const TRADE_LIMIT = 1000;

export function parseBinanceKlines(rows: unknown): Candle[] {
  if (!Array.isArray(rows)) return [];
  const out: Candle[] = [];
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    const time = secFromMs(row[0]);
    const open = num(row[1]); const high = num(row[2]);
    const low = num(row[3]); const close = num(row[4]); const volume = num(row[5]);
    if (time === null || open === null || high === null || low === null || close === null || volume === null) continue;
    out.push({ time: time as Candle["time"], open, high, low, close, volume });
  }
  return out; // Binance returns ascending
}

export const binanceCandleProvider: CandleProvider = {
  id: "binance",
  pageLimit: 1000,
  supports: (tf) => tf in INTERVAL,
  async fetchCandlePage(req: CandlePageRequest, signal: AbortSignal): Promise<Candle[]> {
    const interval = INTERVAL[req.timeframe];
    if (!interval) return [];
    const url = new URL("https://api.binance.us/api/v3/klines");
    url.searchParams.set("symbol", `${req.base}${req.quote}`);
    url.searchParams.set("interval", interval);
    url.searchParams.set("limit", String(Math.min(req.limit, 1000)));
    if (req.endTimeMs) url.searchParams.set("endTime", String(req.endTimeMs));
    const rows = await httpGetJson<unknown>(url.toString(), signal);
    return parseBinanceKlines(rows);
  },
  async fetchTrades(base, quote, cursor, signal): Promise<TradeBatch> {
    const url = new URL("https://api.binance.us/api/v3/aggTrades");
    url.searchParams.set("symbol", `${base}${quote}`);
    url.searchParams.set("limit", String(TRADE_LIMIT));
    // Backward paging: fetch the window of TRADE_LIMIT ids ending just below
    // the oldest id we already hold.
    if (cursor !== null) {
      url.searchParams.set("fromId", String(Math.max(0, cursor - TRADE_LIMIT)));
    }
    const payload = await httpGetJson<unknown>(url.toString(), signal);
    const { trades, nextCursor } = parseBinanceAggTrades(payload, base, quote);
    const reachedStart = cursor !== null && cursor - TRADE_LIMIT <= 0;
    const fullPage = Array.isArray(payload) && payload.length >= TRADE_LIMIT;
    return { trades, cursor: reachedStart || !fullPage ? null : nextCursor };
  },
};
