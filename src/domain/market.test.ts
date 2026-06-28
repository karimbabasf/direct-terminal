import { describe, expect, it } from "vitest";
import {
  buildExchangeFeed,
  parseBinanceTrade,
  parseCoinbaseTrade,
  type MarketSelection,
} from "./exchanges";
import { applyTradeToCandles } from "./candles";

describe("exchange feed configuration", () => {
  it("builds a Binance direct trade socket for a selected market", () => {
    const market: MarketSelection = {
      exchange: "binance",
      base: "BTC",
      quote: "USDT",
    };

    const feed = buildExchangeFeed(market);

    expect(feed.url).toBe("wss://stream.binance.com:9443/ws/btcusdt@trade");
    expect(feed.kind).toBe("trade-stream");
    expect(feed.requiresAuth).toBe(false);
  });

  it("builds a Coinbase market_trades subscription for SOL-USD", () => {
    const feed = buildExchangeFeed({
      exchange: "coinbase",
      base: "SOL",
      quote: "USD",
    });

    expect(feed.url).toBe("wss://advanced-trade-ws.coinbase.com");
    expect(feed.subscribe).toEqual({
      type: "subscribe",
      product_ids: ["SOL-USD"],
      channel: "market_trades",
    });
  });
});

describe("trade normalization", () => {
  it("normalizes Binance trade payloads", () => {
    expect(
      parseBinanceTrade(
        {
          e: "trade",
          E: 1_704_000_000_500,
          s: "BTCUSDT",
          t: 123,
          p: "42800.25",
          q: "0.015",
        },
        { exchange: "binance", base: "BTC", quote: "USDT" },
      ),
    ).toEqual({
      exchange: "binance",
      symbol: "BTC/USDT",
      price: 42800.25,
      size: 0.015,
      timestamp: 1_704_000_000_500,
    });
  });

  it("normalizes Coinbase market_trades events", () => {
    expect(
      parseCoinbaseTrade(
        {
          channel: "market_trades",
          timestamp: "2026-01-01T00:00:01.250Z",
          events: [
            {
              type: "update",
              trades: [
                {
                  product_id: "SOL-USD",
                  price: "99.42",
                  size: "3.5",
                  time: "2026-01-01T00:00:01.200Z",
                },
              ],
            },
          ],
        },
        { exchange: "coinbase", base: "SOL", quote: "USD" },
      ),
    ).toEqual({
      exchange: "coinbase",
      symbol: "SOL/USD",
      price: 99.42,
      size: 3.5,
      timestamp: Date.parse("2026-01-01T00:00:01.200Z"),
    });
  });
});

describe("local candle aggregation", () => {
  it("rolls live trades into 1-second candles", () => {
    const candles = applyTradeToCandles(
      [],
      {
        exchange: "binance",
        symbol: "ETH/USDT",
        price: 2400,
        size: 1.5,
        timestamp: 1_704_000_000_250,
      },
      1_000,
    );

    const updated = applyTradeToCandles(
      candles,
      {
        exchange: "binance",
        symbol: "ETH/USDT",
        price: 2395,
        size: 0.25,
        timestamp: 1_704_000_000_850,
      },
      1_000,
    );

    expect(updated).toEqual([
      {
        time: 1_704_000_000,
        open: 2400,
        high: 2400,
        low: 2395,
        close: 2395,
        volume: 1.75,
      },
    ]);
  });

  it("starts a new candle on the next timeframe bucket", () => {
    const first = applyTradeToCandles(
      [],
      {
        exchange: "coinbase",
        symbol: "BTC/USD",
        price: 90000,
        size: 0.1,
        timestamp: 1_704_000_000_100,
      },
      1_000,
    );

    const next = applyTradeToCandles(
      first,
      {
        exchange: "coinbase",
        symbol: "BTC/USD",
        price: 90010,
        size: 0.2,
        timestamp: 1_704_000_001_020,
      },
      1_000,
    );

    expect(next).toHaveLength(2);
    expect(next[1]).toMatchObject({
      time: 1_704_000_001,
      open: 90010,
      close: 90010,
      volume: 0.2,
    });
  });
});
