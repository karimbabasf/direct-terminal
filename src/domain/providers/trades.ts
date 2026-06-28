import type { Asset, Quote, TradeTick } from "../types";
import { num } from "./util";
import { krakenPair } from "./kraken";
import type { CandleProvider } from "./types";

export type TradeParse = {
  trades: TradeTick[]; // ascending by timestamp
  nextCursor: number | null; // token for the next-older batch (null = no more)
};

const EMPTY: TradeParse = { trades: [], nextCursor: null };

function symbolOf(base: Asset, quote: Quote): string {
  return `${base}/${quote}`;
}

function ascending(trades: TradeTick[]): TradeTick[] {
  return trades.sort((a, b) => a.timestamp - b.timestamp);
}

// Coinbase: GET /products/{id}/trades → newest-first array of
// { trade_id, side, size, price, time(ISO) }. Backward pagination uses the
// oldest trade_id seen as `?after=`.
export function parseCoinbaseTrades(payload: unknown, base: Asset, quote: Quote): TradeParse {
  if (!Array.isArray(payload) || payload.length === 0) return EMPTY;
  const symbol = symbolOf(base, quote);
  const trades: TradeTick[] = [];
  let minId = Infinity;
  for (const row of payload) {
    const r = row as Record<string, unknown>;
    const price = num(r.price);
    const size = num(r.size);
    const id = num(r.trade_id);
    const timestamp = typeof r.time === "string" ? Date.parse(r.time) : NaN;
    if (price === null || size === null || !Number.isFinite(timestamp)) continue;
    trades.push({ exchange: "coinbase", symbol, price, size, timestamp });
    if (id !== null && id < minId) minId = id;
  }
  return { trades: ascending(trades), nextCursor: Number.isFinite(minId) ? minId : null };
}

// Binance: GET /api/v3/aggTrades → ascending array of { a(aggId), p, q, T }.
// Backward pagination uses the oldest agg id seen.
export function parseBinanceAggTrades(payload: unknown, base: Asset, quote: Quote): TradeParse {
  if (!Array.isArray(payload) || payload.length === 0) return EMPTY;
  const symbol = symbolOf(base, quote);
  const trades: TradeTick[] = [];
  let minId = Infinity;
  for (const row of payload) {
    const r = row as Record<string, unknown>;
    const price = num(r.p);
    const size = num(r.q);
    const timestamp = num(r.T);
    const id = num(r.a);
    if (price === null || size === null || timestamp === null) continue;
    trades.push({ exchange: "binance", symbol, price, size, timestamp });
    if (id !== null && id < minId) minId = id;
  }
  return { trades: ascending(trades), nextCursor: Number.isFinite(minId) ? minId : null };
}

// Kraken: GET /0/public/Trades → { result: { <pair>: [[price, vol, time(sec), ...]], last } }.
// `since` is forward-only, so there is no backward cursor: a single recent batch.
export function parseKrakenTrades(payload: unknown, base: Asset, quote: Quote): TradeParse {
  const result = (payload as { result?: Record<string, unknown> })?.result;
  if (!result) return EMPTY;
  const rows = Object.entries(result).find(([key]) => key !== "last")?.[1];
  if (!Array.isArray(rows)) return EMPTY;
  const symbol = symbolOf(base, quote);
  const trades: TradeTick[] = [];
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    const price = num(row[0]);
    const size = num(row[1]);
    const tsec = num(row[2]);
    if (price === null || size === null || tsec === null) continue;
    trades.push({ exchange: "kraken", symbol, price, size, timestamp: Math.floor(tsec * 1_000) });
  }
  return { trades: ascending(trades), nextCursor: null };
}

export { krakenPair };

// Walk a provider's trade feed backward, newest batch first, until we have
// `targetTrades` or the venue runs dry or we hit `maxPages`. Returns all trades
// ascending by timestamp. Providers without fetchTrades yield nothing.
export async function fetchTradeHistory(
  provider: CandleProvider,
  base: Asset,
  quote: Quote,
  opts: { maxPages: number; targetTrades: number },
  signal: AbortSignal,
): Promise<TradeTick[]> {
  if (!provider.fetchTrades) return [];
  let all: TradeTick[] = [];
  let cursor: number | null = null;
  for (let page = 0; page < opts.maxPages; page++) {
    const batch = await provider.fetchTrades(base, quote, cursor, signal);
    if (signal.aborted) break;
    if (batch.trades.length === 0) break;
    all = [...batch.trades, ...all]; // older batch goes in front
    if (all.length >= opts.targetTrades) break;
    if (batch.cursor === null) break;
    cursor = batch.cursor;
  }
  return ascending(all);
}
