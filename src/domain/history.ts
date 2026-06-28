import type { Candle, Timeframe } from "./types";
import { getTimeframeMs } from "./candles";
import type { MarketSelection } from "./exchanges";

type HistoryResult = {
  candles: Candle[];
  note: string;
};

const BINANCE_INTERVALS: Partial<Record<Timeframe, string>> = {
  "1s": "1s",
  "1m": "1m",
  "3m": "3m",
  "5m": "5m",
  "15m": "15m",
  "30m": "30m",
  "1h": "1h",
  "4h": "4h",
  "1d": "1d",
};

export async function fetchHistoricalCandles(
  selection: MarketSelection,
  timeframe: Timeframe,
  signal: AbortSignal,
): Promise<HistoryResult> {
  if (selection.exchange === "binance") {
    return fetchBinanceCandles(selection, timeframe, signal);
  }

  return {
    candles: [],
    note: "Live trade aggregation. Historical 1s cache is exchange-specific.",
  };
}

async function fetchBinanceCandles(
  selection: MarketSelection,
  timeframe: Timeframe,
  signal: AbortSignal,
): Promise<HistoryResult> {
  const interval = BINANCE_INTERVALS[timeframe];
  if (!interval) {
    return {
      candles: [],
      note: `${timeframe} is locally aggregated from live Binance trades.`,
    };
  }

  const symbol = `${selection.base}${selection.quote}`;
  const url = new URL("https://api.binance.com/api/v3/klines");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("interval", interval);
  url.searchParams.set("limit", timeframe === "1s" ? "600" : "500");

  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Binance history returned ${response.status}`);
  }

  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error("Binance history response was not an array");
  }

  return {
    candles: payload.map(toBinanceCandle).filter(isCandle),
    note: `Seeded from Binance ${interval} klines, then direct trades update locally.`,
  };
}

function toBinanceCandle(row: unknown): Candle | null {
  if (!Array.isArray(row)) {
    return null;
  }
  const [openTime, open, high, low, close, volume] = row;
  const time = toNumber(openTime);
  const openValue = toNumber(open);
  const highValue = toNumber(high);
  const lowValue = toNumber(low);
  const closeValue = toNumber(close);
  const volumeValue = toNumber(volume);

  if (
    time === null ||
    openValue === null ||
    highValue === null ||
    lowValue === null ||
    closeValue === null ||
    volumeValue === null
  ) {
    return null;
  }

  return {
    time: Math.floor(time / getTimeframeMs("1s")) as Candle["time"],
    open: openValue,
    high: highValue,
    low: lowValue,
    close: closeValue,
    volume: volumeValue,
  };
}

function toNumber(value: unknown): number | null {
  const numeric =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(numeric) ? numeric : null;
}

function isCandle(value: Candle | null): value is Candle {
  return value !== null;
}
