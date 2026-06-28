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

const SECONDS_TIMEFRAMES: Timeframe[] = ["1s", "5s", "15s", "30s"];

export function isSecondsTimeframe(timeframe: Timeframe): boolean {
  return SECONDS_TIMEFRAMES.includes(timeframe);
}

// The whole-second timestamp of the bucket a trade-time (ms) falls into.
function bucketSecondsOf(timestampMs: number, timeframeMs: number): Candle["time"] {
  const bucketStartMs = Math.floor(timestampMs / timeframeMs) * timeframeMs;
  return Math.floor(bucketStartMs / 1_000) as Candle["time"];
}

// A flat "doji" candle for an interval with no trades: it holds the previous
// close so the chart stays continuous (no gaps) and the price line is unbroken.
function flatCandle(time: Candle["time"], prevClose: number): Candle {
  return { time, open: prevClose, high: prevClose, low: prevClose, close: prevClose, volume: 0 };
}

// Soft ceiling purely for memory safety with deep history + live updates.
// History (10k+) must never be truncated by live aggregation, so this is high.
export function applyTradeToCandles(
  candles: Candle[],
  trade: TradeTick,
  timeframeMs: number,
  maxCandles = 60_000,
): Candle[] {
  const bucketSeconds = bucketSecondsOf(trade.timestamp, timeframeMs);
  const last = candles[candles.length - 1];

  if (last && bucketSeconds <= last.time) {
    // Trade lands in (or before) the forming bucket: fold it into the last candle.
    if (last.time !== bucketSeconds) return candles; // stale/out-of-order; ignore
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

  // Fill any intervals skipped since the last candle with flat carry-forward
  // candles so a quiet stretch never leaves holes in the series.
  const fillers = last ? gapFillers(last, bucketSeconds, timeframeMs) : [];
  return [...candles, ...fillers, newCandle].slice(-maxCandles);
}

// Flat candles for every empty bucket strictly between `from` and `toTime`.
function gapFillers(from: Candle, toTime: number, timeframeMs: number): Candle[] {
  const step = Math.floor(timeframeMs / 1_000);
  if (step <= 0) return [];
  const out: Candle[] = [];
  for (let t = from.time + step; t < toTime; t += step) {
    out.push(flatCandle(t as Candle["time"], from.close));
  }
  return out;
}

// Advance the series to the current wall-clock bucket, appending flat
// carry-forward candles for any intervals that elapsed without a trade. Keeps
// seconds charts moving smoothly even when the market goes quiet.
export function advanceCandles(
  candles: Candle[],
  timeframeMs: number,
  nowMs: number,
  maxCandles = 60_000,
): Candle[] {
  const last = candles[candles.length - 1];
  if (!last) return candles;
  const currentBucket = bucketSecondsOf(nowMs, timeframeMs);
  if (currentBucket <= last.time) return candles;

  const step = Math.floor(timeframeMs / 1_000);
  if (step <= 0) return candles;
  const fillers: Candle[] = [];
  for (let t = last.time + step; t <= currentBucket; t += step) {
    fillers.push(flatCandle(t as Candle["time"], last.close));
  }
  return [...candles, ...fillers].slice(-maxCandles);
}

// Aggregate a batch of trades into OHLCV candles for one timeframe, filling
// empty intervals with flat carry-forward candles. Used to seed seconds history
// from an exchange's trade feed (no exchange offers sub-minute klines).
export function tradesToCandles(trades: TradeTick[], timeframeMs: number): Candle[] {
  if (trades.length === 0) return [];
  const sorted = [...trades].sort((a, b) => a.timestamp - b.timestamp);
  let candles: Candle[] = [];
  for (const t of sorted) {
    candles = applyTradeToCandles(candles, t, timeframeMs);
  }
  return candles;
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
