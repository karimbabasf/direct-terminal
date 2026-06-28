import type { UTCTimestamp } from "lightweight-charts";

export const ASSETS = ["BTC", "ETH", "SOL"] as const;
export type Asset = (typeof ASSETS)[number];

export const QUOTES = ["USD", "USDT", "USDC"] as const;
export type Quote = (typeof QUOTES)[number];

export const TIMEFRAMES = [
  "1s",
  "5s",
  "15s",
  "30s",
  "1m",
  "3m",
  "5m",
  "15m",
  "30m",
  "1h",
  "4h",
  "1d",
] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];

export type Candle = {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type TradeTick = {
  exchange: string;
  symbol: string;
  price: number;
  size: number;
  timestamp: number;
};

export type FeedState = "idle" | "connecting" | "live" | "stale" | "error";
