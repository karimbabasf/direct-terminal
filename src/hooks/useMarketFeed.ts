import { useEffect, useMemo, useRef, useState } from "react";
import { applyTradeToCandles, getTimeframeMs } from "../domain/candles";
import {
  buildExchangeFeed,
  parseTradeMessage,
  type ExchangeFeed,
  type MarketSelection,
} from "../domain/exchanges";
import { fetchHistoricalCandles } from "../domain/history";
import type { Candle, FeedState, Timeframe, TradeTick } from "../domain/types";

export type FeedTelemetry = {
  state: FeedState;
  error: string | null;
  latencyMs: number | null;
  tradesPerSecond: number;
  totalTrades: number;
  historyNote: string;
  feed: ExchangeFeed;
  candles: Candle[];
  recentTrades: TradeTick[];
  lastTrade: TradeTick | null;
};

export function useMarketFeed(
  selection: MarketSelection,
  timeframe: Timeframe,
): FeedTelemetry {
  const feed = useMemo(() => buildExchangeFeed(selection), [selection]);
  const [state, setState] = useState<FeedState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [recentTrades, setRecentTrades] = useState<TradeTick[]>([]);
  const [lastTrade, setLastTrade] = useState<TradeTick | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [tradesPerSecond, setTradesPerSecond] = useState(0);
  const [totalTrades, setTotalTrades] = useState(0);
  const [historyNote, setHistoryNote] = useState("Loading history.");

  const lastSeenAtRef = useRef(0);
  const perSecondCounterRef = useRef(0);
  const bufferRef = useRef<TradeTick[]>([]);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setCandles([]);
    setRecentTrades([]);
    setLastTrade(null);
    setLatencyMs(null);
    setTotalTrades(0);
    setTradesPerSecond(0);
    setHistoryNote("Loading history.");

    fetchHistoricalCandles(selection, timeframe, controller.signal)
      .then((result) => {
        setCandles(result.candles);
        setHistoryNote(result.note);
      })
      .catch((historyError: unknown) => {
        if (!controller.signal.aborted) {
          setHistoryNote(
            historyError instanceof Error
              ? historyError.message
              : "History unavailable; live trades will build the chart.",
          );
        }
      });

    return () => controller.abort();
  }, [selection, timeframe]);

  useEffect(() => {
    let cancelled = false;
    const socket = new WebSocket(feed.url);
    const intervalMs = getTimeframeMs(timeframe);

    setState("connecting");
    setError(null);
    bufferRef.current = [];
    lastSeenAtRef.current = 0;
    perSecondCounterRef.current = 0;

    const flush = () => {
      frameRef.current = null;
      const ticks = bufferRef.current.splice(0);
      if (ticks.length === 0) {
        return;
      }

      const newest = ticks[ticks.length - 1];
      lastSeenAtRef.current = Date.now();
      perSecondCounterRef.current += ticks.length;
      setLastTrade(newest);
      setLatencyMs(Math.max(0, Date.now() - newest.timestamp));
      setTotalTrades((count) => count + ticks.length);
      setRecentTrades((trades) => [...ticks, ...trades].slice(0, 42));
      setCandles((current) =>
        ticks.reduce(
          (next, tick) => applyTradeToCandles(next, tick, intervalMs),
          current,
        ),
      );
    };

    const scheduleFlush = () => {
      if (frameRef.current === null) {
        frameRef.current = window.requestAnimationFrame(flush);
      }
    };

    socket.onopen = () => {
      if (cancelled) {
        return;
      }
      if (feed.subscribe) {
        socket.send(JSON.stringify(feed.subscribe));
      }
      setState("live");
    };

    socket.onmessage = (event) => {
      if (typeof event.data !== "string") {
        return;
      }
      const ticks = parseTradeMessage(feed, event.data);
      if (ticks.length > 0) {
        bufferRef.current.push(...ticks);
        scheduleFlush();
      }
    };

    socket.onerror = () => {
      if (!cancelled) {
        setState("error");
        setError(`${feed.label} socket error`);
      }
    };

    socket.onclose = () => {
      if (!cancelled) {
        setState(lastSeenAtRef.current ? "stale" : "error");
        setError(`${feed.label} stream closed`);
      }
    };

    const tpsInterval = window.setInterval(() => {
      setTradesPerSecond(perSecondCounterRef.current);
      perSecondCounterRef.current = 0;
    }, 1_000);

    const staleInterval = window.setInterval(() => {
      if (
        lastSeenAtRef.current > 0 &&
        Date.now() - lastSeenAtRef.current > 5_000
      ) {
        setState("stale");
      } else if (lastSeenAtRef.current > 0) {
        setState("live");
      }
    }, 1_000);

    return () => {
      cancelled = true;
      window.clearInterval(tpsInterval);
      window.clearInterval(staleInterval);
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
      socket.close();
    };
  }, [feed, timeframe]);

  return {
    state,
    error,
    latencyMs,
    tradesPerSecond,
    totalTrades,
    historyNote,
    feed,
    candles,
    recentTrades,
    lastTrade,
  };
}
