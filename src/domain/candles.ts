import type { Candle, Timeframe, TradeTick } from "./types";

export const TIMEFRAME_MS: Record<Timeframe, number> = {
  "1s": 1_000,
  "5s": 5_000,
  "15s": 15_000,
  "30s": 30_000,
  "1m": 60_000,
  "3m": 180_000,
  "5m": 300_000,
  "15m": 900_000,
  "30m": 1_800_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
};

export function getTimeframeMs(timeframe: Timeframe): number {
  return TIMEFRAME_MS[timeframe];
}

// Soft ceiling purely for memory safety with deep history + live updates.
// History (10k+) must never be truncated by live aggregation, so this is high.
export function applyTradeToCandles(
  candles: Candle[],
  trade: TradeTick,
  timeframeMs: number,
  maxCandles = 60_000,
): Candle[] {
  const bucketStartMs = Math.floor(trade.timestamp / timeframeMs) * timeframeMs;
  const bucketSeconds = Math.floor(bucketStartMs / 1_000) as Candle["time"];
  const last = candles[candles.length - 1];

  if (last?.time === bucketSeconds) {
    const next = candles.slice(0, -1);
    next.push({
      ...last,
      high: Math.max(last.high, trade.price),
      low: Math.min(last.low, trade.price),
      close: trade.price,
      volume: roundVolume(last.volume + trade.size),
    });
    return next;
  }

  const newCandle: Candle = {
    time: bucketSeconds,
    open: trade.price,
    high: trade.price,
    low: trade.price,
    close: trade.price,
    volume: roundVolume(trade.size),
  };

  return [...candles, newCandle].slice(-maxCandles);
}

export function candleChange(candles: Candle[]): number {
  const first = candles[0];
  const last = candles[candles.length - 1];
  if (!first || !last || first.open === 0) {
    return 0;
  }
  return ((last.close - first.open) / first.open) * 100;
}

function roundVolume(value: number): number {
  return Math.round(value * 1_000_000_000) / 1_000_000_000;
}
