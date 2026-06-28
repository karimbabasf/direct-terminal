import { useEffect, useRef, useState } from "react";
import type { MarketSelection } from "../domain/exchanges";
import { getOrderBookProvider, type OrderBook } from "../domain/orderbook";
import type { FeedState } from "../domain/types";

const DEPTH = 12;

export function useOrderBook(selection: MarketSelection): {
  book: OrderBook | null;
  status: FeedState;
} {
  const [book, setBook] = useState<OrderBook | null>(null);
  const [status, setStatus] = useState<FeedState>("idle");
  const frameRef = useRef<number | null>(null);
  const latestRef = useRef<OrderBook | null>(null);

  useEffect(() => {
    setBook(null);
    latestRef.current = null;
    const provider = getOrderBookProvider(selection.exchange);
    if (!provider) {
      setStatus("idle");
      return;
    }

    const feed = provider.feed(selection);
    const reduce = provider.createReducer(DEPTH);
    let cancelled = false;
    setStatus("connecting");
    const socket = new WebSocket(feed.url);

    const flush = () => {
      frameRef.current = null;
      if (latestRef.current) setBook(latestRef.current);
    };
    const schedule = () => {
      if (frameRef.current === null) frameRef.current = window.requestAnimationFrame(flush);
    };

    socket.onopen = () => {
      if (cancelled) return;
      if (feed.subscribe) socket.send(JSON.stringify(feed.subscribe));
      setStatus("live");
    };
    socket.onmessage = (event) => {
      if (typeof event.data !== "string") return;
      const next = reduce(event.data);
      if (next) {
        latestRef.current = next;
        schedule();
      }
    };
    socket.onerror = () => {
      if (!cancelled) setStatus("error");
    };
    socket.onclose = () => {
      if (!cancelled) setStatus((s) => (s === "live" ? "stale" : "error"));
    };

    return () => {
      cancelled = true;
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      socket.close();
    };
  }, [selection.exchange, selection.base, selection.quote]);

  return { book, status };
}
