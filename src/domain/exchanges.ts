import type { Asset, Quote, TradeTick } from "./types";

export type ExchangeId = "binance" | "coinbase" | "kraken" | "okx" | "bybit";

export type MarketSelection = {
  exchange: ExchangeId;
  base: Asset;
  quote: Quote;
};

export type ExchangeFeed = {
  exchange: ExchangeId;
  label: string;
  productId: string;
  symbol: string;
  url: string;
  kind: "trade-stream";
  subscribe?: unknown;
  requiresAuth: false;
};

export const EXCHANGE_META: Record<
  ExchangeId,
  {
    name: string;
    venue: string;
    source: string;
    quality: string;
  }
> = {
  binance: {
    name: "Binance",
    venue: "Global spot",
    source: "Public WebSocket trade stream",
    quality: "Native 1s klines available; trades aggregated locally here.",
  },
  coinbase: {
    name: "Coinbase",
    venue: "US spot",
    source: "Advanced Trade market_trades WebSocket",
    quality: "Public trades; 1s candles are locally aggregated.",
  },
  kraken: {
    name: "Kraken",
    venue: "US/EU spot",
    source: "WebSocket v2 trade channel",
    quality: "Public trades; 1s candles are locally aggregated.",
  },
  okx: {
    name: "OKX",
    venue: "Global spot",
    source: "V5 public trades WebSocket",
    quality: "Public trades; 1s candles are locally aggregated.",
  },
  bybit: {
    name: "Bybit",
    venue: "Global spot",
    source: "V5 public trade WebSocket",
    quality: "Public trades; 1s candles are locally aggregated.",
  },
};

const MARKET_QUOTES: Record<ExchangeId, Record<Asset, Quote[]>> = {
  binance: {
    BTC: ["USDT", "USDC"],
    ETH: ["USDT", "USDC"],
    SOL: ["USDT", "USDC"],
  },
  coinbase: {
    BTC: ["USD", "USDC"],
    ETH: ["USD", "USDC"],
    SOL: ["USD", "USDC"],
  },
  kraken: {
    BTC: ["USD"],
    ETH: ["USD"],
    SOL: ["USD"],
  },
  okx: {
    BTC: ["USDT", "USDC"],
    ETH: ["USDT", "USDC"],
    SOL: ["USDT", "USDC"],
  },
  bybit: {
    BTC: ["USDT", "USDC"],
    ETH: ["USDT", "USDC"],
    SOL: ["USDT", "USDC"],
  },
};

export const EXCHANGES = Object.keys(EXCHANGE_META) as ExchangeId[];

export function getAvailableQuotes(exchange: ExchangeId, base: Asset): Quote[] {
  return MARKET_QUOTES[exchange][base];
}

export function isMarketSupported(selection: MarketSelection): boolean {
  return getAvailableQuotes(selection.exchange, selection.base).includes(
    selection.quote,
  );
}

export function getMarketsForAsset(base: Asset): MarketSelection[] {
  return EXCHANGES.flatMap((exchange) =>
    MARKET_QUOTES[exchange][base].map((quote) => ({
      exchange,
      base,
      quote,
    })),
  );
}

export function normalizeSelection(selection: MarketSelection): MarketSelection {
  if (isMarketSupported(selection)) {
    return selection;
  }
  return {
    ...selection,
    quote: getAvailableQuotes(selection.exchange, selection.base)[0],
  };
}

export function marketLabel(selection: MarketSelection): string {
  return `${selection.base}/${selection.quote}`;
}

export function buildExchangeFeed(selectionInput: MarketSelection): ExchangeFeed {
  const selection = normalizeSelection(selectionInput);
  const productId = productIdFor(selection);
  const symbol = marketLabel(selection);
  const label = `${EXCHANGE_META[selection.exchange].name} ${symbol}`;

  switch (selection.exchange) {
    case "binance": {
      const stream = productId.toLowerCase();
      return {
        exchange: "binance",
        label,
        productId,
        symbol,
        url: `wss://stream.binance.com:9443/ws/${stream}@trade`,
        kind: "trade-stream",
        requiresAuth: false,
      };
    }
    case "coinbase":
      return {
        exchange: "coinbase",
        label,
        productId,
        symbol,
        url: "wss://advanced-trade-ws.coinbase.com",
        kind: "trade-stream",
        subscribe: {
          type: "subscribe",
          product_ids: [productId],
          channel: "market_trades",
        },
        requiresAuth: false,
      };
    case "kraken":
      return {
        exchange: "kraken",
        label,
        productId,
        symbol,
        url: "wss://ws.kraken.com/v2",
        kind: "trade-stream",
        subscribe: {
          method: "subscribe",
          params: {
            channel: "trade",
            symbol: [productId],
            snapshot: false,
          },
        },
        requiresAuth: false,
      };
    case "okx":
      return {
        exchange: "okx",
        label,
        productId,
        symbol,
        url: "wss://ws.okx.com:8443/ws/v5/public",
        kind: "trade-stream",
        subscribe: {
          op: "subscribe",
          args: [{ channel: "trades", instId: productId }],
        },
        requiresAuth: false,
      };
    case "bybit":
      return {
        exchange: "bybit",
        label,
        productId,
        symbol,
        url: "wss://stream.bybit.com/v5/public/spot",
        kind: "trade-stream",
        subscribe: {
          op: "subscribe",
          args: [`publicTrade.${productId}`],
        },
        requiresAuth: false,
      };
  }
}

export function parseTradeMessage(
  feed: ExchangeFeed,
  rawMessage: string,
): TradeTick[] {
  const message = safeJson(rawMessage);
  if (!message) {
    return [];
  }

  const selection = selectionFromFeed(feed);
  switch (feed.exchange) {
    case "binance":
      return compact([parseBinanceTrade(message, selection)]);
    case "coinbase":
      return compact([parseCoinbaseTrade(message, selection)]);
    case "kraken":
      return parseKrakenTrades(message, selection);
    case "okx":
      return parseOkxTrades(message, selection);
    case "bybit":
      return parseBybitTrades(message, selection);
  }
}

export function parseBinanceTrade(
  message: Record<string, unknown>,
  selection: MarketSelection,
): TradeTick | null {
  const price = toNumber(message.p);
  const size = toNumber(message.q);
  const timestamp = toNumber(message.T ?? message.E);
  if (!price || !size || !timestamp) {
    return null;
  }
  return tick(selection, price, size, timestamp);
}

export function parseCoinbaseTrade(
  message: Record<string, unknown>,
  selection: MarketSelection,
): TradeTick | null {
  const events = asArray(message.events);
  for (const event of events) {
    const trades = asArray(asRecord(event).trades);
    for (const tradeInput of trades) {
      const trade = asRecord(tradeInput);
      const price = toNumber(trade.price);
      const size = toNumber(trade.size);
      const timestamp = parseTimestamp(trade.time ?? message.timestamp);
      if (price && size && timestamp) {
        return tick(selection, price, size, timestamp);
      }
    }
  }
  return null;
}

function parseKrakenTrades(
  message: Record<string, unknown>,
  selection: MarketSelection,
): TradeTick[] {
  return asArray(message.data)
    .map((input) => {
      const trade = asRecord(input);
      const price = toNumber(trade.price);
      const size = toNumber(trade.qty);
      const timestamp = parseTimestamp(trade.timestamp);
      return price && size && timestamp
        ? tick(selection, price, size, timestamp)
        : null;
    })
    .filter(isTradeTick);
}

function parseOkxTrades(
  message: Record<string, unknown>,
  selection: MarketSelection,
): TradeTick[] {
  return asArray(message.data)
    .map((input) => {
      const trade = asRecord(input);
      const price = toNumber(trade.px);
      const size = toNumber(trade.sz);
      const timestamp = parseTimestamp(trade.ts);
      return price && size && timestamp
        ? tick(selection, price, size, timestamp)
        : null;
    })
    .filter(isTradeTick);
}

function parseBybitTrades(
  message: Record<string, unknown>,
  selection: MarketSelection,
): TradeTick[] {
  return asArray(message.data)
    .map((input) => {
      const trade = asRecord(input);
      const price = toNumber(trade.p);
      const size = toNumber(trade.v);
      const timestamp = parseTimestamp(trade.T);
      return price && size && timestamp
        ? tick(selection, price, size, timestamp)
        : null;
    })
    .filter(isTradeTick);
}

function selectionFromFeed(feed: ExchangeFeed): MarketSelection {
  const [base, quote] = feed.symbol.split("/") as [Asset, Quote];
  return { exchange: feed.exchange, base, quote };
}

function productIdFor(selection: MarketSelection): string {
  switch (selection.exchange) {
    case "binance":
    case "bybit":
      return `${selection.base}${selection.quote}`;
    case "coinbase":
    case "okx":
      return `${selection.base}-${selection.quote}`;
    case "kraken":
      return `${selection.base}/${selection.quote}`;
  }
}

function tick(
  selection: MarketSelection,
  price: number,
  size: number,
  timestamp: number,
): TradeTick {
  return {
    exchange: selection.exchange,
    symbol: marketLabel(selection),
    price,
    size,
    timestamp,
  };
}

function toNumber(value: unknown): number | null {
  const numberValue =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(numberValue) ? numberValue : null;
}

function parseTimestamp(value: unknown): number | null {
  if (typeof value === "number") {
    return value > 10_000_000_000 ? value : value * 1_000;
  }
  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric > 10_000_000_000 ? numeric : numeric * 1_000;
    }
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function safeJson(rawMessage: string): Record<string, unknown> | null {
  try {
    return asRecord(JSON.parse(rawMessage));
  } catch {
    return null;
  }
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function compact<T>(values: Array<T | null>): T[] {
  return values.filter((value): value is T => value !== null);
}

function isTradeTick(value: TradeTick | null): value is TradeTick {
  return value !== null;
}
