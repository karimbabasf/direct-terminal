import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  advanceCandles,
  applyTradeToCandles,
  getTimeframeMs,
  isSecondsTimeframe,
  tradesToCandles,
} from "../domain/candles";
import {
  EXCHANGE_META,
  buildExchangeFeed,
  parseTradeMessage,
  type ExchangeFeed,
  type MarketSelection,
} from "../domain/exchanges";
import { getCandleProvider } from "../domain/providers";
import { fetchTradeHistory } from "../domain/providers/trades";
import { fetchHistoryWindow, prependCandles } from "../domain/paginate";
import type { Candle, FeedState, Timeframe, TradeTick } from "../domain/types";

// Bars fetched up-front for a fast, full first paint. Scroll-back extends toward MAX.
const INITIAL_TARGET = 2000;
const MAX_CANDLES = 12000;

// Seconds frames have no sub-minute klines anywhere, so they are seeded from the
// trade feed. Keep the seed shallow for a fast first paint; carry-forward then
// keeps the chart continuous and live without further fetching.
const SECONDS_SEED_MAX_PAGES = 4;
const SECONDS_SEED_TARGET_TRADES = 4000;
// Cadence at which quiet seconds get a flat carry-forward candle so the chart
// keeps moving 24/7 even when no trades print.
const CARRY_FORWARD_TICK_MS = 250;

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
  loadingHistory: boolean;
  historyExhausted: boolean;
  loadOlder: () => void;
};

export function useMarketFeed(
  selection: MarketSelection,
  timeframe: Timeframe,
): FeedTelemetry {
  const feed = useMemo(() => buildExchangeFeed(selection), [selection]);
  const provider = useMemo(
    () => getCandleProvider(selection.exchange),
    [selection.exchange],
  );

  const [state, setState] = useState<FeedState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [recentTrades, setRecentTrades] = useState<TradeTick[]>([]);
  const [lastTrade, setLastTrade] = useState<TradeTick | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [tradesPerSecond, setTradesPerSecond] = useState(0);
  const [totalTrades, setTotalTrades] = useState(0);
  const [historyNote, setHistoryNote] = useState("Loading history.");
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyExhausted, setHistoryExhausted] = useState(false);

  const lastSeenAtRef = useRef(0);
  const perSecondCounterRef = useRef(0);
  const bufferRef = useRef<TradeTick[]>([]);
  const frameRef = useRef<number | null>(null);

  // Mirror of `candles` so loadOlder reads the live oldest without stale closures.
  const candlesRef = useRef<Candle[]>([]);
  useEffect(() => {
    candlesRef.current = candles;
  }, [candles]);

  // History loading flags live in refs so the scroll handler can read them sync.
  const loadingRef = useRef(false);
  const exhaustedRef = useRef(false);

  // Initial history window on every market/timeframe change.
  useEffect(() => {
    const controller = new AbortController();
    setCandles([]);
    setRecentTrades([]);
    setLastTrade(null);
    setLatencyMs(null);
    setTotalTrades(0);
    setTradesPerSecond(0);
    loadingRef.current = false;
    exhaustedRef.current = false;
    setHistoryExhausted(false);

    const venue = EXCHANGE_META[selection.exchange].name;
    const intervalMs = getTimeframeMs(timeframe);

    // Seconds frames: no exchange serves sub-minute klines, so seed the chart by
    // aggregating recent trades client-side, then let carry-forward run it live.
    if (isSecondsTimeframe(timeframe)) {
      // The seed is a recent window only; scroll-back beyond it isn't supported
      // (trade endpoints can't deep-paginate sub-minute history cheaply).
      exhaustedRef.current = true;
      setHistoryExhausted(true);

      if (!provider.fetchTrades) {
        setLoadingHistory(false);
        setHistoryNote(`${timeframe} builds live from ${venue} trades.`);
        return () => controller.abort();
      }

      setLoadingHistory(true);
      setHistoryNote(`Seeding ${venue} ${timeframe} from trades…`);
      fetchTradeHistory(
        provider,
        selection.base,
        selection.quote,
        { maxPages: SECONDS_SEED_MAX_PAGES, targetTrades: SECONDS_SEED_TARGET_TRADES },
        controller.signal,
      )
        .then((trades) => {
          if (controller.signal.aborted) return;
          const seeded = advanceCandles(
            tradesToCandles(trades, intervalMs),
            intervalMs,
            Date.now(),
          );
          setCandles(seeded);
          setHistoryNote(
            seeded.length
              ? `${seeded.length.toLocaleString()} ${venue} ${timeframe} bars · live`
              : `No recent ${venue} trades; ${timeframe} builds live.`,
          );
        })
        .catch((historyError: unknown) => {
          if (controller.signal.aborted) return;
          setHistoryNote(
            historyError instanceof Error
              ? `${venue} ${timeframe} seed failed: ${historyError.message}`
              : `${venue} ${timeframe} seed unavailable; building live.`,
          );
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoadingHistory(false);
        });
      return () => controller.abort();
    }

    if (!provider.supports(timeframe)) {
      exhaustedRef.current = true;
      setHistoryExhausted(true);
      setLoadingHistory(false);
      setHistoryNote(`${timeframe} has no REST history on ${venue}; building live from trades.`);
      return () => controller.abort();
    }

    setLoadingHistory(true);
    setHistoryNote(`Loading ${venue} history…`);

    fetchHistoryWindow(
      provider,
      selection.base,
      selection.quote,
      timeframe,
      INITIAL_TARGET,
      controller.signal,
    )
      .then((initial) => {
        if (controller.signal.aborted) return;
        setCandles(initial);
        if (initial.length < INITIAL_TARGET) {
          exhaustedRef.current = true;
          setHistoryExhausted(true);
        }
        setHistoryNote(
          initial.length
            ? `${initial.length.toLocaleString()} ${venue} bars · scroll left for more`
            : `No history returned by ${venue}; live trades will build the chart.`,
        );
      })
      .catch((historyError: unknown) => {
        if (controller.signal.aborted) return;
        setHistoryNote(
          historyError instanceof Error
            ? `${venue} history failed: ${historyError.message}`
            : `${venue} history unavailable; live trades will build the chart.`,
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingHistory(false);
      });

    return () => controller.abort();
  }, [provider, selection.exchange, selection.base, selection.quote, timeframe]);

  // Fetch the next older page and prepend it (TradingView-style scroll-back).
  const loadOlder = useCallback(() => {
    const current = candlesRef.current;
    if (loadingRef.current || exhaustedRef.current || current.length === 0) return;
    if (current.length >= MAX_CANDLES) {
      exhaustedRef.current = true;
      setHistoryExhausted(true);
      return;
    }

    loadingRef.current = true;
    setLoadingHistory(true);
    const controller = new AbortController();

    provider
      .fetchCandlePage(
        {
          base: selection.base,
          quote: selection.quote,
          timeframe,
          endTimeMs: current[0].time * 1000 - 1,
          limit: provider.pageLimit,
        },
        controller.signal,
      )
      .then((older) => {
        if (older.length === 0) {
          exhaustedRef.current = true;
          setHistoryExhausted(true);
          return;
        }
        setCandles((existing) => prependCandles(existing, older));
        const approx = candlesRef.current.length + older.length;
        const venue = EXCHANGE_META[selection.exchange].name;
        setHistoryNote(`~${approx.toLocaleString()} ${venue} bars loaded · scroll for more`);
        if (older.length < provider.pageLimit) {
          exhaustedRef.current = true;
          setHistoryExhausted(true);
        }
      })
      .catch(() => {
        /* keep what we have; a later scroll can retry */
      })
      .finally(() => {
        loadingRef.current = false;
        setLoadingHistory(false);
      });
  }, [provider, selection.exchange, selection.base, selection.quote, timeframe]);

  // Live trade stream → forming candle.
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
      if (ticks.length === 0) return;

      const newest = ticks[ticks.length - 1];
      lastSeenAtRef.current = Date.now();
      perSecondCounterRef.current += ticks.length;
      setLastTrade(newest);
      setLatencyMs(Math.max(0, Date.now() - newest.timestamp));
      setTotalTrades((count) => count + ticks.length);
      setRecentTrades((trades) => [...ticks, ...trades].slice(0, 42));
      setCandles((current) =>
        ticks.reduce((next, tick) => applyTradeToCandles(next, tick, intervalMs), current),
      );
    };

    const scheduleFlush = () => {
      if (frameRef.current === null) {
        frameRef.current = window.requestAnimationFrame(flush);
      }
    };

    socket.onopen = () => {
      if (cancelled) return;
      if (feed.subscribe) socket.send(JSON.stringify(feed.subscribe));
      setState("live");
    };

    socket.onmessage = (event) => {
      if (typeof event.data !== "string") return;
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
      if (lastSeenAtRef.current > 0 && Date.now() - lastSeenAtRef.current > 5_000) {
        setState("stale");
      } else if (lastSeenAtRef.current > 0) {
        setState("live");
      }
    }, 1_000);

    // Seconds frames: advance the series over wall-clock time so quiet intervals
    // still produce flat carry-forward candles — the chart never stalls between
    // trades. advanceCandles returns the same array when nothing elapsed, so
    // React skips the render and this stays cheap.
    const carryForward = isSecondsTimeframe(timeframe)
      ? window.setInterval(() => {
          setCandles((current) => advanceCandles(current, intervalMs, Date.now()));
        }, CARRY_FORWARD_TICK_MS)
      : null;

    return () => {
      cancelled = true;
      window.clearInterval(tpsInterval);
      window.clearInterval(staleInterval);
      if (carryForward !== null) window.clearInterval(carryForward);
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
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
    loadingHistory,
    historyExhausted,
    loadOlder,
  };
}
