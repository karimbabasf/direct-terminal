# Candle History Engine — Implementation Plan (Phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a CORS-safe, per-exchange REST candle-history layer that can paginate backward to 10,000+ bars, exposed through one uniform interface.

**Architecture:** One `CandleProvider` interface, one implementation per venue (Binance, Bybit, OKX, Coinbase, Kraken). Each provider hides its venue's quirks (interval encoding, param names, response order) and returns clean `Candle[]` sorted oldest→newest. A generic paginator walks backward via an `endTime` cursor. All HTTP goes through one `httpGetJson` helper that uses the Tauri HTTP plugin in the app (no CORS) and `window.fetch` in the browser (dev).

**Tech Stack:** TypeScript, vitest, `@tauri-apps/plugin-http`, `tauri-plugin-http` (Rust), lightweight-charts types.

## Global Constraints

- `Candle.time` is a **UTCTimestamp in seconds** (lightweight-charts convention). Every provider returns seconds, not ms.
- Candle arrays are always **strictly time-ascending and unique**. The paginator/merge utilities enforce this.
- No new runtime deps beyond `@tauri-apps/plugin-http`. No API keys (public endpoints only).
- Pure parser functions are **exported separately** from provider objects so they can be unit-tested without network.
- Follow existing code style in `src/domain` (named exports, small helpers, `toNumber`-style guards).
- Tests run with `pnpm test` (vitest). New tests live next to the code as `*.test.ts`.

---

### Task 1: CORS-safe HTTP helper + Tauri plugin wiring

**Files:**
- Create: `src/domain/http.ts`
- Test: `src/domain/http.test.ts`
- Modify: `package.json` (add `@tauri-apps/plugin-http`), `src-tauri/Cargo.toml` (add `tauri-plugin-http`), `src-tauri/src/lib.rs` (register plugin), `src-tauri/capabilities/default.json` (allow exchange hosts)

**Interfaces:**
- Produces: `isTauri(): boolean`, `httpGetJson<T>(url: string, signal?: AbortSignal): Promise<T>`

- [ ] **Step 1: Install deps**

```bash
cd /Users/karimbaba/Developer/Trading
pnpm add @tauri-apps/plugin-http
cargo add tauri-plugin-http --manifest-path src-tauri/Cargo.toml
```

- [ ] **Step 2: Register the Rust plugin** — `src-tauri/src/lib.rs`, add `.plugin(tauri_plugin_http::init())` to the builder chain (alongside the existing opener plugin).

- [ ] **Step 3: Allow exchange hosts** — `src-tauri/capabilities/default.json`, add to `permissions`:

```json
{
  "identifier": "http:default",
  "allow": [
    { "url": "https://api.binance.com/*" },
    { "url": "https://api.bybit.com/*" },
    { "url": "https://www.okx.com/*" },
    { "url": "https://api.exchange.coinbase.com/*" },
    { "url": "https://api.kraken.com/*" }
  ]
}
```

- [ ] **Step 4: Write the failing test** — `src/domain/http.test.ts`

```ts
import { describe, expect, it, vi, afterEach } from "vitest";
import { httpGetJson, isTauri } from "./http";

afterEach(() => vi.restoreAllMocks());

describe("isTauri", () => {
  it("is false in the jsdom/browser test env", () => {
    expect(isTauri()).toBe(false);
  });
});

describe("httpGetJson", () => {
  it("uses window.fetch and returns parsed JSON when not in Tauri", async () => {
    const json = [{ a: 1 }];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(json) }));
    await expect(httpGetJson("https://example.com")).resolves.toEqual(json);
  });

  it("throws on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429, json: () => Promise.resolve({}) }));
    await expect(httpGetJson("https://example.com")).rejects.toThrow("429");
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `pnpm test -- src/domain/http.test.ts`
Expected: FAIL — cannot find module `./http`.

- [ ] **Step 6: Implement** — `src/domain/http.ts`

```ts
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function httpGetJson<T = unknown>(
  url: string,
  signal?: AbortSignal,
): Promise<T> {
  if (isTauri()) {
    const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
    const response = await tauriFetch(url, { method: "GET", signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }
    return (await response.json()) as T;
  }

  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return (await response.json()) as T;
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `pnpm test -- src/domain/http.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 8: Commit**

```bash
git add src/domain/http.ts src/domain/http.test.ts package.json pnpm-lock.yaml src-tauri/
git commit -m "feat(history): CORS-safe httpGetJson via Tauri http plugin"
```

---

### Task 2: Provider types + shared numeric guards

**Files:**
- Create: `src/domain/providers/types.ts`
- Create: `src/domain/providers/util.ts`
- Test: `src/domain/providers/util.test.ts`

**Interfaces:**
- Produces:
  - `type CandlePageRequest = { base: Asset; quote: Quote; timeframe: Timeframe; endTimeMs?: number; limit: number }`
  - `interface CandleProvider { id: ExchangeId; pageLimit: number; supports(tf: Timeframe): boolean; fetchCandlePage(req: CandlePageRequest, signal: AbortSignal): Promise<Candle[]> }`
  - `num(value: unknown): number | null`
  - `secFromMs(value: unknown): number | null` (ms or sec → seconds, floored)
- Consumes: `Candle, Timeframe, Asset, Quote` from `../types`; `ExchangeId` from `../exchanges`.

- [ ] **Step 1: Write the failing test** — `src/domain/providers/util.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { num, secFromMs } from "./util";

describe("num", () => {
  it("parses numbers and numeric strings, rejects junk", () => {
    expect(num(12.5)).toBe(12.5);
    expect(num("0.001")).toBe(0.001);
    expect(num("abc")).toBeNull();
    expect(num(null)).toBeNull();
  });
});

describe("secFromMs", () => {
  it("passes seconds through and floors", () => {
    expect(secFromMs(1_700_000_000)).toBe(1_700_000_000);
  });
  it("converts ms to seconds", () => {
    expect(secFromMs(1_700_000_000_000)).toBe(1_700_000_000);
  });
  it("accepts numeric strings", () => {
    expect(secFromMs("1700000000000")).toBe(1_700_000_000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/domain/providers/util.test.ts`
Expected: FAIL — cannot find module `./util`.

- [ ] **Step 3: Implement** — `src/domain/providers/util.ts`

```ts
export function num(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

// Accepts a unix time in seconds or milliseconds and returns whole seconds.
export function secFromMs(value: unknown): number | null {
  const n = num(value);
  if (n === null) return null;
  return Math.floor(n > 10_000_000_000 ? n / 1000 : n);
}
```

- [ ] **Step 4: Implement** — `src/domain/providers/types.ts`

```ts
import type { Asset, Candle, Quote, Timeframe } from "../types";
import type { ExchangeId } from "../exchanges";

export type CandlePageRequest = {
  base: Asset;
  quote: Quote;
  timeframe: Timeframe;
  endTimeMs?: number; // exclusive upper bound; omit for latest
  limit: number;
};

export interface CandleProvider {
  id: ExchangeId;
  pageLimit: number;
  supports(timeframe: Timeframe): boolean;
  fetchCandlePage(req: CandlePageRequest, signal: AbortSignal): Promise<Candle[]>;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test -- src/domain/providers/util.test.ts`
Expected: PASS (5 assertions across 3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/domain/providers/types.ts src/domain/providers/util.ts src/domain/providers/util.test.ts
git commit -m "feat(history): CandleProvider interface + numeric guards"
```

---

### Task 3: Merge / dedupe / prepend utilities

**Files:**
- Create: `src/domain/paginate.ts`
- Test: `src/domain/paginate.test.ts`

**Interfaces:**
- Produces: `mergeDedupeSort(candles: Candle[]): Candle[]`, `prependCandles(existing: Candle[], older: Candle[]): Candle[]`
- Consumes: `Candle` from `./types`.

- [ ] **Step 1: Write the failing test** — `src/domain/paginate.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { mergeDedupeSort, prependCandles } from "./paginate";
import type { Candle } from "./types";

const c = (time: number, close = 1): Candle =>
  ({ time: time as Candle["time"], open: 1, high: 1, low: 1, close, volume: 1 });

describe("mergeDedupeSort", () => {
  it("sorts ascending and removes duplicate timestamps (last wins)", () => {
    const out = mergeDedupeSort([c(3), c(1), c(2), c(2, 99)]);
    expect(out.map((x) => x.time)).toEqual([1, 2, 3]);
    expect(out.find((x) => x.time === 2)?.close).toBe(99);
  });
});

describe("prependCandles", () => {
  it("merges an older page in front while staying ascending-unique", () => {
    const existing = [c(10), c(11), c(12)];
    const older = [c(8), c(9), c(10, 5)]; // 10 overlaps the boundary
    const out = prependCandles(existing, older);
    expect(out.map((x) => x.time)).toEqual([8, 9, 10, 11, 12]);
    expect(out.find((x) => x.time === 10)?.close).toBe(1); // existing wins on overlap
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/domain/paginate.test.ts`
Expected: FAIL — cannot find module `./paginate`.

- [ ] **Step 3: Implement** — `src/domain/paginate.ts`

```ts
import type { Candle } from "./types";

export function mergeDedupeSort(candles: Candle[]): Candle[] {
  const byTime = new Map<number, Candle>();
  for (const candle of candles) {
    byTime.set(candle.time, candle); // later entries overwrite earlier
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

// Older page goes first so that, on a boundary duplicate, the EXISTING bar wins.
export function prependCandles(existing: Candle[], older: Candle[]): Candle[] {
  return mergeDedupeSort([...older, ...existing]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/domain/paginate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/paginate.ts src/domain/paginate.test.ts
git commit -m "feat(history): merge/dedupe/prepend candle utilities"
```

---

### Task 4: Binance candle provider

**Files:**
- Create: `src/domain/providers/binance.ts`
- Test: `src/domain/providers/binance.test.ts`

**Interfaces:**
- Produces: `parseBinanceKlines(rows: unknown): Candle[]`, `binanceCandleProvider: CandleProvider`
- Consumes: `httpGetJson` (Task 1), `num`/`secFromMs` (Task 2), `CandleProvider`/`CandlePageRequest` (Task 2).

- [ ] **Step 1: Write the failing test** — `src/domain/providers/binance.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { parseBinanceKlines, binanceCandleProvider } from "./binance";

// [ openTime(ms), open, high, low, close, volume, closeTime, ... ]
const SAMPLE = [
  [1700000000000, "100.0", "110.0", "90.0", "105.0", "12.5", 1700000059999],
  [1700000060000, "105.0", "120.0", "104.0", "118.0", "8.0", 1700000119999],
];

describe("parseBinanceKlines", () => {
  it("maps rows to ascending candles in seconds", () => {
    const out = parseBinanceKlines(SAMPLE);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ time: 1700000000, open: 100, high: 110, low: 90, close: 105, volume: 12.5 });
    expect(out[1].close).toBe(118);
  });
  it("returns [] for non-array input", () => {
    expect(parseBinanceKlines({})).toEqual([]);
  });
});

describe("binanceCandleProvider", () => {
  it("supports standard frames but not 5s/15s/30s", () => {
    expect(binanceCandleProvider.supports("1m")).toBe(true);
    expect(binanceCandleProvider.supports("1s")).toBe(true);
    expect(binanceCandleProvider.supports("15s")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/domain/providers/binance.test.ts`
Expected: FAIL — cannot find module `./binance`.

- [ ] **Step 3: Implement** — `src/domain/providers/binance.ts`

```ts
import type { Candle, Timeframe } from "../types";
import { httpGetJson } from "../http";
import { num, secFromMs } from "./util";
import type { CandleProvider, CandlePageRequest } from "./types";

const INTERVAL: Partial<Record<Timeframe, string>> = {
  "1s": "1s", "1m": "1m", "3m": "3m", "5m": "5m", "15m": "15m",
  "30m": "30m", "1h": "1h", "4h": "4h", "1d": "1d",
};

export function parseBinanceKlines(rows: unknown): Candle[] {
  if (!Array.isArray(rows)) return [];
  const out: Candle[] = [];
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    const time = secFromMs(row[0]);
    const open = num(row[1]); const high = num(row[2]);
    const low = num(row[3]); const close = num(row[4]); const volume = num(row[5]);
    if (time === null || open === null || high === null || low === null || close === null || volume === null) continue;
    out.push({ time: time as Candle["time"], open, high, low, close, volume });
  }
  return out; // Binance returns ascending
}

export const binanceCandleProvider: CandleProvider = {
  id: "binance",
  pageLimit: 1000,
  supports: (tf) => tf in INTERVAL,
  async fetchCandlePage(req: CandlePageRequest, signal: AbortSignal): Promise<Candle[]> {
    const interval = INTERVAL[req.timeframe];
    if (!interval) return [];
    const url = new URL("https://api.binance.com/api/v3/klines");
    url.searchParams.set("symbol", `${req.base}${req.quote}`);
    url.searchParams.set("interval", interval);
    url.searchParams.set("limit", String(Math.min(req.limit, 1000)));
    if (req.endTimeMs) url.searchParams.set("endTime", String(req.endTimeMs));
    const rows = await httpGetJson<unknown>(url.toString(), signal);
    return parseBinanceKlines(rows);
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/domain/providers/binance.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/providers/binance.ts src/domain/providers/binance.test.ts
git commit -m "feat(history): Binance candle provider"
```

---

### Task 5: Backward paginator (`fetchHistoryWindow`)

**Files:**
- Modify: `src/domain/paginate.ts`
- Test: `src/domain/paginate.test.ts` (extend)

**Interfaces:**
- Produces: `fetchHistoryWindow(provider: CandleProvider, base: Asset, quote: Quote, timeframe: Timeframe, targetCount: number, signal: AbortSignal): Promise<Candle[]>`
- Consumes: `CandleProvider` (Task 2), `prependCandles` (Task 3).

- [ ] **Step 1: Write the failing test** — extend `src/domain/paginate.test.ts`

```ts
import { fetchHistoryWindow } from "./paginate";
import type { CandleProvider } from "./providers/types";

// A mock provider with `total` synthetic bars at 60s spacing ending "now".
function mockProvider(total: number, pageLimit = 1000): CandleProvider {
  const base = 1_700_000_000;
  const all = Array.from({ length: total }, (_, i) => c(base + i * 60));
  return {
    id: "binance", pageLimit, supports: () => true,
    async fetchCandlePage(req) {
      const endSec = req.endTimeMs ? Math.floor(req.endTimeMs / 1000) : Infinity;
      const older = all.filter((x) => x.time <= endSec);
      return older.slice(Math.max(0, older.length - Math.min(req.limit, pageLimit)));
    },
  };
}

describe("fetchHistoryWindow", () => {
  it("paginates backward until it reaches the target", async () => {
    const out = await fetchHistoryWindow(mockProvider(5000, 1000), "BTC", "USDT", "1m", 3000, new AbortController().signal);
    expect(out.length).toBeGreaterThanOrEqual(3000);
    for (let i = 1; i < out.length; i++) expect(out[i].time).toBeGreaterThan(out[i - 1].time);
  });

  it("stops cleanly when the venue is exhausted", async () => {
    const out = await fetchHistoryWindow(mockProvider(400, 1000), "BTC", "USDT", "1m", 10000, new AbortController().signal);
    expect(out).toHaveLength(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/domain/paginate.test.ts`
Expected: FAIL — `fetchHistoryWindow` is not exported.

- [ ] **Step 3: Implement** — append to `src/domain/paginate.ts`

```ts
import type { Asset, Quote, Timeframe } from "./types";
import type { CandleProvider } from "./providers/types";

export async function fetchHistoryWindow(
  provider: CandleProvider,
  base: Asset,
  quote: Quote,
  timeframe: Timeframe,
  targetCount: number,
  signal: AbortSignal,
): Promise<Candle[]> {
  let all: Candle[] = [];
  let cursor: number | undefined;
  while (all.length < targetCount) {
    const page = await provider.fetchCandlePage(
      { base, quote, timeframe, endTimeMs: cursor, limit: provider.pageLimit },
      signal,
    );
    if (page.length === 0) break; // exhausted
    all = prependCandles(all, page);
    const nextCursor = all[0].time * 1000 - 1; // ms, exclusive of the oldest we have
    if (cursor !== undefined && nextCursor >= cursor) break; // no progress guard
    cursor = nextCursor;
    if (page.length < provider.pageLimit) break; // last page from venue
  }
  return all;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/domain/paginate.test.ts`
Expected: PASS (all paginate tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/paginate.ts src/domain/paginate.test.ts
git commit -m "feat(history): backward paginator fetchHistoryWindow"
```

---

### Task 6: Bybit candle provider

**Files:**
- Create: `src/domain/providers/bybit.ts`
- Test: `src/domain/providers/bybit.test.ts`

**Interfaces:**
- Produces: `parseBybitKlines(payload: unknown): Candle[]`, `bybitCandleProvider: CandleProvider`

Notes: Bybit returns `result.list` **newest-first**, rows `[startMs, open, high, low, close, volume, turnover]`. Interval is minutes (`1,3,5,15,30,60,120,240,360,720`, `D`, `W`, `M`). Backward cursor param is `end` (ms).

- [ ] **Step 1: Write the failing test** — `src/domain/providers/bybit.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { parseBybitKlines, bybitCandleProvider } from "./bybit";

const SAMPLE = {
  retCode: 0,
  result: {
    list: [
      ["1700000060000", "105", "120", "104", "118", "8.0", "900"],
      ["1700000000000", "100", "110", "90", "105", "12.5", "1200"],
    ],
  },
};

describe("parseBybitKlines", () => {
  it("reverses newest-first into ascending candles in seconds", () => {
    const out = parseBybitKlines(SAMPLE);
    expect(out.map((c) => c.time)).toEqual([1700000000, 1700000060]);
    expect(out[0]).toEqual({ time: 1700000000, open: 100, high: 110, low: 90, close: 105, volume: 12.5 });
  });
  it("returns [] when result.list is missing", () => {
    expect(parseBybitKlines({ result: {} })).toEqual([]);
  });
});

describe("bybitCandleProvider", () => {
  it("supports minute/hour/day frames, not seconds frames", () => {
    expect(bybitCandleProvider.supports("1m")).toBe(true);
    expect(bybitCandleProvider.supports("4h")).toBe(true);
    expect(bybitCandleProvider.supports("1s")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- src/domain/providers/bybit.test.ts`
Expected: FAIL — cannot find module `./bybit`.

- [ ] **Step 3: Implement** — `src/domain/providers/bybit.ts`

```ts
import type { Candle, Timeframe } from "../types";
import { httpGetJson } from "../http";
import { num, secFromMs } from "./util";
import { mergeDedupeSort } from "../paginate";
import type { CandleProvider, CandlePageRequest } from "./types";

const INTERVAL: Partial<Record<Timeframe, string>> = {
  "1m": "1", "3m": "3", "5m": "5", "15m": "15", "30m": "30",
  "1h": "60", "4h": "240", "1d": "D",
};

export function parseBybitKlines(payload: unknown): Candle[] {
  const list = (payload as { result?: { list?: unknown } })?.result?.list;
  if (!Array.isArray(list)) return [];
  const out: Candle[] = [];
  for (const row of list) {
    if (!Array.isArray(row)) continue;
    const time = secFromMs(row[0]);
    const open = num(row[1]); const high = num(row[2]);
    const low = num(row[3]); const close = num(row[4]); const volume = num(row[5]);
    if (time === null || open === null || high === null || low === null || close === null || volume === null) continue;
    out.push({ time: time as Candle["time"], open, high, low, close, volume });
  }
  return mergeDedupeSort(out); // input is newest-first
}

export const bybitCandleProvider: CandleProvider = {
  id: "bybit",
  pageLimit: 1000,
  supports: (tf) => tf in INTERVAL,
  async fetchCandlePage(req: CandlePageRequest, signal: AbortSignal): Promise<Candle[]> {
    const interval = INTERVAL[req.timeframe];
    if (!interval) return [];
    const url = new URL("https://api.bybit.com/v5/market/kline");
    url.searchParams.set("category", "spot");
    url.searchParams.set("symbol", `${req.base}${req.quote}`);
    url.searchParams.set("interval", interval);
    url.searchParams.set("limit", String(Math.min(req.limit, 1000)));
    if (req.endTimeMs) url.searchParams.set("end", String(req.endTimeMs));
    const payload = await httpGetJson<unknown>(url.toString(), signal);
    return parseBybitKlines(payload);
  },
};
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test -- src/domain/providers/bybit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/providers/bybit.ts src/domain/providers/bybit.test.ts
git commit -m "feat(history): Bybit candle provider"
```

---

### Task 7: OKX candle provider

**Files:**
- Create: `src/domain/providers/okx.ts`
- Test: `src/domain/providers/okx.test.ts`

Notes: OKX returns `data` **newest-first**, rows `[ts(ms), o, h, l, c, vol, volCcy, ...]`. Interval `bar` uses uppercase hour/day (`1m,3m,5m,15m,30m,1H,4H,1D`). Page cap **300**. Backward cursor param `after` (ms) returns records older than ts.

- [ ] **Step 1: Write the failing test** — `src/domain/providers/okx.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { parseOkxCandles, okxCandleProvider } from "./okx";

const SAMPLE = {
  code: "0",
  data: [
    ["1700000060000", "105", "120", "104", "118", "8.0", "1"],
    ["1700000000000", "100", "110", "90", "105", "12.5", "1"],
  ],
};

describe("parseOkxCandles", () => {
  it("reverses newest-first into ascending candles in seconds", () => {
    const out = parseOkxCandles(SAMPLE);
    expect(out.map((c) => c.time)).toEqual([1700000000, 1700000060]);
    expect(out[1].close).toBe(118);
  });
});

describe("okxCandleProvider", () => {
  it("page cap is 300 and maps frames to OKX bars", () => {
    expect(okxCandleProvider.pageLimit).toBe(300);
    expect(okxCandleProvider.supports("4h")).toBe(true);
    expect(okxCandleProvider.supports("1s")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- src/domain/providers/okx.test.ts`
Expected: FAIL — cannot find module `./okx`.

- [ ] **Step 3: Implement** — `src/domain/providers/okx.ts`

```ts
import type { Candle, Timeframe } from "../types";
import { httpGetJson } from "../http";
import { num, secFromMs } from "./util";
import { mergeDedupeSort } from "../paginate";
import type { CandleProvider, CandlePageRequest } from "./types";

const BAR: Partial<Record<Timeframe, string>> = {
  "1m": "1m", "3m": "3m", "5m": "5m", "15m": "15m", "30m": "30m",
  "1h": "1H", "4h": "4H", "1d": "1D",
};

export function parseOkxCandles(payload: unknown): Candle[] {
  const data = (payload as { data?: unknown })?.data;
  if (!Array.isArray(data)) return [];
  const out: Candle[] = [];
  for (const row of data) {
    if (!Array.isArray(row)) continue;
    const time = secFromMs(row[0]);
    const open = num(row[1]); const high = num(row[2]);
    const low = num(row[3]); const close = num(row[4]); const volume = num(row[5]);
    if (time === null || open === null || high === null || low === null || close === null || volume === null) continue;
    out.push({ time: time as Candle["time"], open, high, low, close, volume });
  }
  return mergeDedupeSort(out); // input is newest-first
}

export const okxCandleProvider: CandleProvider = {
  id: "okx",
  pageLimit: 300,
  supports: (tf) => tf in BAR,
  async fetchCandlePage(req: CandlePageRequest, signal: AbortSignal): Promise<Candle[]> {
    const bar = BAR[req.timeframe];
    if (!bar) return [];
    const url = new URL("https://www.okx.com/api/v5/market/candles");
    url.searchParams.set("instId", `${req.base}-${req.quote}`);
    url.searchParams.set("bar", bar);
    url.searchParams.set("limit", String(Math.min(req.limit, 300)));
    if (req.endTimeMs) url.searchParams.set("after", String(req.endTimeMs));
    const payload = await httpGetJson<unknown>(url.toString(), signal);
    return parseOkxCandles(payload);
  },
};
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test -- src/domain/providers/okx.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/providers/okx.ts src/domain/providers/okx.test.ts
git commit -m "feat(history): OKX candle provider"
```

---

### Task 8: Coinbase candle provider

**Files:**
- Create: `src/domain/providers/coinbase.ts`
- Test: `src/domain/providers/coinbase.test.ts`

Notes: Coinbase Exchange returns an array **newest-first**, rows `[time(sec), low, high, open, close, volume]` (note column order!). `granularity` in seconds from a fixed set `{60,300,900,3600,21600,86400}`. Page cap **300**. Window via `start`/`end` ISO-8601.

- [ ] **Step 1: Write the failing test** — `src/domain/providers/coinbase.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { parseCoinbaseCandles, coinbaseCandleProvider } from "./coinbase";

// [ time(sec), low, high, open, close, volume ]  — newest first
const SAMPLE = [
  [1700000060, 104, 120, 105, 118, 8.0],
  [1700000000, 90, 110, 100, 105, 12.5],
];

describe("parseCoinbaseCandles", () => {
  it("maps low/high/open/close column order into ascending candles", () => {
    const out = parseCoinbaseCandles(SAMPLE);
    expect(out.map((c) => c.time)).toEqual([1700000000, 1700000060]);
    expect(out[0]).toEqual({ time: 1700000000, open: 100, high: 110, low: 90, close: 105, volume: 12.5 });
  });
});

describe("coinbaseCandleProvider", () => {
  it("supports only frames with a fixed granularity", () => {
    expect(coinbaseCandleProvider.supports("1m")).toBe(true);
    expect(coinbaseCandleProvider.supports("1h")).toBe(true);
    expect(coinbaseCandleProvider.supports("3m")).toBe(false); // no 180s granularity
    expect(coinbaseCandleProvider.supports("1s")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- src/domain/providers/coinbase.test.ts`
Expected: FAIL — cannot find module `./coinbase`.

- [ ] **Step 3: Implement** — `src/domain/providers/coinbase.ts`

```ts
import type { Candle, Timeframe } from "../types";
import { httpGetJson } from "../http";
import { num, secFromMs } from "./util";
import { mergeDedupeSort } from "../paginate";
import { getTimeframeMs } from "../candles";
import type { CandleProvider, CandlePageRequest } from "./types";

const GRANULARITY: Partial<Record<Timeframe, number>> = {
  "1m": 60, "5m": 300, "15m": 900, "1h": 3600, "4h": 21600, "1d": 86400,
};

export function parseCoinbaseCandles(payload: unknown): Candle[] {
  if (!Array.isArray(payload)) return [];
  const out: Candle[] = [];
  for (const row of payload) {
    if (!Array.isArray(row)) continue;
    const time = secFromMs(row[0]);
    const low = num(row[1]); const high = num(row[2]);
    const open = num(row[3]); const close = num(row[4]); const volume = num(row[5]);
    if (time === null || open === null || high === null || low === null || close === null || volume === null) continue;
    out.push({ time: time as Candle["time"], open, high, low, close, volume });
  }
  return mergeDedupeSort(out); // input is newest-first
}

export const coinbaseCandleProvider: CandleProvider = {
  id: "coinbase",
  pageLimit: 300,
  supports: (tf) => tf in GRANULARITY,
  async fetchCandlePage(req: CandlePageRequest, signal: AbortSignal): Promise<Candle[]> {
    const granularity = GRANULARITY[req.timeframe];
    if (!granularity) return [];
    const url = new URL(`https://api.exchange.coinbase.com/products/${req.base}-${req.quote}/candles`);
    url.searchParams.set("granularity", String(granularity));
    if (req.endTimeMs) {
      const endSec = Math.floor(req.endTimeMs / 1000);
      const startSec = endSec - granularity * Math.min(req.limit, 300);
      url.searchParams.set("end", new Date(endSec * 1000).toISOString());
      url.searchParams.set("start", new Date(startSec * 1000).toISOString());
    }
    const payload = await httpGetJson<unknown>(url.toString(), signal);
    return parseCoinbaseCandles(payload);
  },
};
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test -- src/domain/providers/coinbase.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/providers/coinbase.ts src/domain/providers/coinbase.test.ts
git commit -m "feat(history): Coinbase candle provider"
```

---

### Task 9: Kraken candle provider

**Files:**
- Create: `src/domain/providers/kraken.ts`
- Test: `src/domain/providers/kraken.test.ts`

Notes: Kraken returns `result[pair]` **ascending**, rows `[time(sec), open, high, low, close, vwap, volume, count]`. Interval is minutes `{1,5,15,30,60,240,1440}`. Cap ~720, `since` is forward-only — so deep backward pagination is **not** available; this provider returns the most recent window only (documented limitation). Pair codes use Kraken's `XBT` for BTC.

- [ ] **Step 1: Write the failing test** — `src/domain/providers/kraken.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { parseKrakenOhlc, krakenPair, krakenCandleProvider } from "./kraken";

const SAMPLE = {
  error: [],
  result: {
    XXBTZUSD: [
      [1700000000, "100", "110", "90", "105", "101", "12.5", 30],
      [1700000060, "105", "120", "104", "118", "110", "8.0", 22],
    ],
    last: 1700000060,
  },
};

describe("parseKrakenOhlc", () => {
  it("reads result[pair] into ascending candles, ignoring `last`", () => {
    const out = parseKrakenOhlc(SAMPLE);
    expect(out.map((c) => c.time)).toEqual([1700000000, 1700000060]);
    expect(out[1]).toEqual({ time: 1700000060, open: 105, high: 120, low: 104, close: 118, volume: 8.0 });
  });
});

describe("krakenPair", () => {
  it("maps BTC to XBT", () => {
    expect(krakenPair("BTC", "USD")).toBe("XBTUSD");
    expect(krakenPair("ETH", "USD")).toBe("ETHUSD");
  });
});

describe("krakenCandleProvider", () => {
  it("supports minute frames, not seconds frames", () => {
    expect(krakenCandleProvider.supports("1m")).toBe(true);
    expect(krakenCandleProvider.supports("1s")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- src/domain/providers/kraken.test.ts`
Expected: FAIL — cannot find module `./kraken`.

- [ ] **Step 3: Implement** — `src/domain/providers/kraken.ts`

```ts
import type { Asset, Candle, Quote, Timeframe } from "../types";
import { httpGetJson } from "../http";
import { num } from "./util";
import { mergeDedupeSort } from "../paginate";
import type { CandleProvider, CandlePageRequest } from "./types";

const INTERVAL: Partial<Record<Timeframe, string>> = {
  "1m": "1", "5m": "5", "15m": "15", "30m": "30", "1h": "60", "4h": "240", "1d": "1440",
};

export function krakenPair(base: Asset, quote: Quote): string {
  const b = base === "BTC" ? "XBT" : base;
  return `${b}${quote}`;
}

export function parseKrakenOhlc(payload: unknown): Candle[] {
  const result = (payload as { result?: Record<string, unknown> })?.result;
  if (!result) return [];
  const rows = Object.entries(result).find(([key]) => key !== "last")?.[1];
  if (!Array.isArray(rows)) return [];
  const out: Candle[] = [];
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    const time = num(row[0]);
    const open = num(row[1]); const high = num(row[2]);
    const low = num(row[3]); const close = num(row[4]); const volume = num(row[6]);
    if (time === null || open === null || high === null || low === null || close === null || volume === null) continue;
    out.push({ time: Math.floor(time) as Candle["time"], open, high, low, close, volume });
  }
  return mergeDedupeSort(out);
}

export const krakenCandleProvider: CandleProvider = {
  id: "kraken",
  pageLimit: 720,
  supports: (tf) => tf in INTERVAL,
  async fetchCandlePage(req: CandlePageRequest, signal: AbortSignal): Promise<Candle[]> {
    const interval = INTERVAL[req.timeframe];
    if (!interval) return [];
    // Kraken `since` is forward-only; we cannot deep-paginate backward.
    // Once we already hold the recent window (endTimeMs set), stop.
    if (req.endTimeMs) return [];
    const url = new URL("https://api.kraken.com/0/public/OHLC");
    url.searchParams.set("pair", krakenPair(req.base, req.quote));
    url.searchParams.set("interval", interval);
    const payload = await httpGetJson<unknown>(url.toString(), signal);
    return parseKrakenOhlc(payload);
  },
};
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test -- src/domain/providers/kraken.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/providers/kraken.ts src/domain/providers/kraken.test.ts
git commit -m "feat(history): Kraken candle provider (recent-window only)"
```

---

### Task 10: Provider registry

**Files:**
- Create: `src/domain/providers/index.ts`
- Test: `src/domain/providers/index.test.ts`

**Interfaces:**
- Produces: `getCandleProvider(id: ExchangeId): CandleProvider`

- [ ] **Step 1: Write the failing test** — `src/domain/providers/index.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { getCandleProvider } from "./index";

describe("getCandleProvider", () => {
  it("returns the matching provider for each venue", () => {
    expect(getCandleProvider("binance").id).toBe("binance");
    expect(getCandleProvider("bybit").id).toBe("bybit");
    expect(getCandleProvider("okx").id).toBe("okx");
    expect(getCandleProvider("coinbase").id).toBe("coinbase");
    expect(getCandleProvider("kraken").id).toBe("kraken");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- src/domain/providers/index.test.ts`
Expected: FAIL — cannot find module `./index`.

- [ ] **Step 3: Implement** — `src/domain/providers/index.ts`

```ts
import type { ExchangeId } from "../exchanges";
import type { CandleProvider } from "./types";
import { binanceCandleProvider } from "./binance";
import { bybitCandleProvider } from "./bybit";
import { okxCandleProvider } from "./okx";
import { coinbaseCandleProvider } from "./coinbase";
import { krakenCandleProvider } from "./kraken";

const CANDLE_PROVIDERS: Record<ExchangeId, CandleProvider> = {
  binance: binanceCandleProvider,
  bybit: bybitCandleProvider,
  okx: okxCandleProvider,
  coinbase: coinbaseCandleProvider,
  kraken: krakenCandleProvider,
};

export function getCandleProvider(id: ExchangeId): CandleProvider {
  return CANDLE_PROVIDERS[id];
}

export type { CandleProvider, CandlePageRequest } from "./types";
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test -- src/domain/providers/index.test.ts`
Expected: PASS.

- [ ] **Step 5: Full suite + typecheck, then commit**

Run: `pnpm test` then `pnpm build`
Expected: all tests pass; `tsc` clean.

```bash
git add src/domain/providers/index.ts src/domain/providers/index.test.ts
git commit -m "feat(history): candle provider registry"
```

---

## Self-Review

**1. Spec coverage (vs. §4.1, §4.2, §4.3 of the design):**
- §4.1 `CandleProvider` interface + 5 venues → Tasks 2, 4, 6, 7, 8, 9. ✅
- §4.2 CORS via Tauri http + fetch fallback → Task 1. ✅
- §4.3 backward paginator → Task 5. ✅; merge/dedupe/prepend → Task 3. ✅
- Per-venue caps (1000/1000/300/300/720) encoded in each provider. ✅
- Kraken forward-only limitation handled explicitly (Task 9). ✅
- `supports()` per venue gates unsupported (sub-minute) frames. ✅
- Registry → Task 10. ✅
- **Out of scope for Phase 1 (correctly deferred to Phase 2):** wiring into `useMarketFeed`, removing the 720 cap, chart lazy-load. Those consume this layer but aren't built here.

**2. Placeholder scan:** No TBD/TODO; every code step has complete code; every test has real assertions. ✅

**3. Type consistency:** `CandleProvider`/`CandlePageRequest` defined once (Task 2) and consumed unchanged in Tasks 4–10. `mergeDedupeSort`/`prependCandles` (Task 3) reused by providers (6–9) and paginator (5). `num`/`secFromMs` (Task 2) reused everywhere. `Candle.time` is seconds throughout. ✅

**Note for implementer:** Sample payloads in tests are representative; if a live call reveals a column/param difference, fix the parser AND its test together (TDD), then re-run. This is expected for Risk R1 in the spec.
