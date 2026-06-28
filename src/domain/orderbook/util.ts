import { num } from "../providers/util";
import type { OrderBookLevel } from "./types";

export function safeJson(raw: string): any {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function asArr(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

// [price, size] string pairs -> levels
export function toLevelsFromPairs(rows: unknown): OrderBookLevel[] {
  return asArr(rows)
    .map((row) => {
      const a = asArr(row);
      const price = num(a[0]);
      const size = num(a[1]);
      return price !== null && size !== null ? { price, size } : null;
    })
    .filter((x): x is OrderBookLevel => x !== null);
}

// Apply one level to a price->size map; size <= 0 removes the level.
export function applyPair(map: Map<number, number>, priceRaw: unknown, sizeRaw: unknown): void {
  const price = num(priceRaw);
  const size = num(sizeRaw);
  if (price === null || size === null) return;
  if (size <= 0) map.delete(price);
  else map.set(price, size);
}

// Best N levels: bids high->low, asks low->high.
export function topLevels(
  map: Map<number, number>,
  side: "bid" | "ask",
  n: number,
): OrderBookLevel[] {
  const out = [...map.entries()].map(([price, size]) => ({ price, size }));
  out.sort((a, b) => (side === "bid" ? b.price - a.price : a.price - b.price));
  return out.slice(0, n);
}
