# Direct Terminal — Liquid-Glass Redesign + Deep History + Order Book

- **Date:** 2026-06-27
- **Status:** Approved (design); ready for implementation plan
- **Author:** Karim + Claude (mentor pairing)
- **Stack:** Tauri 2 · React 19 · TypeScript · Vite 7 · lightweight-charts v5 · lucide-react

---

## 1. Context — what exists today

`Direct Terminal` is a desktop crypto terminal. Architecture is clean:

- `App.tsx` — top-level state (selection, timeframe, drawing mode), grid layout: header / [sidebar · chart · tape].
- `hooks/useMarketFeed.ts` — the data engine. Effect 1 fetches history; Effect 2 opens a WebSocket trade stream, buffers ticks, flushes on `requestAnimationFrame`, and aggregates trades into candles.
- `domain/candles.ts` — `applyTradeToCandles` buckets trades into OHLCV candles.
- `domain/history.ts` — REST history (Binance only).
- `domain/exchanges.ts` — 5 venues (Binance, Coinbase, Kraken, OKX, Bybit): WebSocket trade feeds + per-venue parsers.
- `components/TradingChart.tsx` — lightweight-charts candle + volume series, plus an SVG drawing overlay (trend / horizontal / measure).

### Three blocking gaps vs. the goal

1. **Candle depth.** History caps at ~500 bars and only Binance fetches any. Live aggregation hard-truncates at `maxCandles = 720` (`candles.ts:26`). The chart can never hold 10k bars. The default market (Coinbase/SOL) fetches **zero** history → opens to an empty chart.
2. **No lazy-loading.** The chart calls `setData` + `fitContent` once. No scroll-back-to-load-more.
3. **Visual.** Competent dark terminal, but opaque panels, no depth/glass, utilitarian controls.

---

## 2. Goals & non-goals

### Goals
- **G1.** Open to a full chart: load a fast first page, then progressively reach **≥10,000 bars** where the venue allows.
- **G2.** **TradingView-style lazy-load**: scrolling back fetches older pages, prepends seamlessly, up to a ceiling.
- **G3.** Deep history for **all five exchanges** (each with its own REST klines provider; honest about per-venue caps).
- **G4.** **Liquid-glass redesign of the whole terminal** with signature lime/cyan/amber glow, modern controls, OHLC HUD.
- **G5.** A live **order-book depth panel** ("the glass").
- **G6.** 60fps with 10k+ candles + live updates.
- **G7.** Accessible: honor `prefers-reduced-motion` and `prefers-reduced-transparency`.

### Non-goals
- No new assets/quotes beyond the current set (BTC/ETH/SOL · USD/USDT/USDC) unless trivial.
- No trading/order placement. Read-only market data.
- No backend service of our own — data comes direct from public exchange REST/WS.
- No auth-gated channels.

---

## 3. Decisions (from brainstorming)

| # | Decision | Choice |
|---|----------|--------|
| D1 | History source | **Per-exchange REST klines provider for all 5 venues** |
| D2 | Redesign scope | **Whole terminal** |
| D3 | Aesthetic | **Liquid glass + signature glow** (keep lime/cyan/amber, make it glow) |
| D4 | Order book | **Included** — live depth panel |

---

## 4. Architecture

### 4.1 History layer — `CandleProvider` per exchange

One interface; one implementation per venue. Each provider hides its own quirks and returns clean candles.

```ts
type CandlePageRequest = {
  base: Asset; quote: Quote; timeframe: Timeframe;
  endTimeMs?: number;   // exclusive upper bound; omit for "latest"
  limit: number;        // requested count (clamped to pageLimit)
};

interface CandleProvider {
  id: ExchangeId;
  pageLimit: number;                       // max bars per request
  supports(timeframe: Timeframe): boolean; // REST klines availability
  fetchCandlePage(req: CandlePageRequest, signal: AbortSignal): Promise<Candle[]>; // OLDEST→NEWEST, sorted, unique
}
```

**Per-venue facts (verify exact params during implementation):**

| Venue | Endpoint | Page cap | Interval encoding | Backward cursor | Order | CORS |
|-------|----------|----------|-------------------|-----------------|-------|------|
| Binance | `api.binance.com/api/v3/klines` | 1000 | `1s,1m,5m,1h,4h,1d` | `endTime` (ms) | asc | ✅ |
| Bybit | `api.bybit.com/v5/market/kline?category=spot` | 1000 | minutes `1,5,60,240`, `D` | `end` (ms) | desc | ✅ |
| OKX | `okx.com/api/v5/market/(history-)candles` | 300 | `1m,5m,1H,4H,1D` | `after` (ms) | desc | ✅ |
| Coinbase | `api.exchange.coinbase.com/products/{p}/candles` | 300 | `granularity` sec | `start`/`end` (ISO) | desc | ✅ |
| Kraken | `api.kraken.com/0/public/OHLC` | ~720 | minutes | `since` (fwd only) | asc | ❌ |

**Implications baked into the design:**
- **Page caps differ** → reaching 10k means ~10 requests (Binance/Bybit), ~34 (OKX/Coinbase). The paginator is cap-agnostic.
- **Kraken is the weak venue**: no true backward pagination + ~720 cap + no CORS. We load what it allows and **clearly label the cap** in the UI. (User accepted lower caps on some venues.)
- **Ordering normalized** in each provider so the paginator always sees oldest→newest.

### 4.2 CORS — route REST through Tauri

`httpGet(url)` helper: use the **Tauri HTTP plugin** when running in the app (native layer, no CORS), fall back to `window.fetch` in a plain browser (dev). This unblocks Kraken (and any future CORS-blocked venue) and keeps providers ignorant of transport.

- Add `tauri-plugin-http` (Cargo) + register in `lib.rs` + allow exchange hosts in `capabilities/default.json` + `@tauri-apps/plugin-http` (npm).
- `isTauri()` guard picks the transport. In browser dev, CORS-friendly venues work; Kraken degrades gracefully.

### 4.3 The paginator + loading model

```
fetchHistoryWindow(provider, req, targetCount):
  pages = []; cursor = undefined
  while total < targetCount and not exhausted:
    page = provider.fetchCandlePage({...req, endTimeMs: cursor, limit: pageLimit})
    if page empty: break (exhausted)
    pages.unshift(page); cursor = page[0].time*1000   // oldest bar's time
  return mergeDedupeSort(flatten(pages))
```

- **On open:** fetch **one** page → render immediately → set visible range to the most recent ~150 bars (instant, readable). Then **background-prefetch** additional pages toward a floor (~2–3k) so early scroll-back is instant.
- **On scroll-back:** subscribe to `timeScale().subscribeVisibleLogicalRangeChange`; when `range.from < THRESHOLD` (e.g. < 30 bars from the left edge) and not already loading and not exhausted → fetch the next older page via the same paginator, `prepend + dedupe + setData`, preserving the user's scroll position. Show a left-edge "Loading history…" pill.
- **Ceiling:** stop at ~10k (configurable) or venue exhaustion; flip a `historyExhausted` flag and stop subscribing.
- **Sub-minute frames** (`5s/15s/30s`) unsupported by REST klines → `supports()` returns false → those frames stay **live-only** with an honest note (today's behavior, but labeled).

### 4.4 Live updates without stutter

Split the pipeline at the data→chart boundary:

- **Committed history** — the large `Candle[]` (history + closed bars). Pushed to the chart via `series.setData()` **only** on initial load, lazy prepend, or bar-rollover. Infrequent.
- **Forming bar** — the single latest candle, updated every flush via `series.update(bar)` (O(1)). High-frequency path never re-renders the whole series.

Remove the `maxCandles = 720` truncation; replace with a generous safety ceiling (~60k) to bound memory. Live trades still bucket via `applyTradeToCandles`; merging into the last bucket is unchanged — we just never slice the front.

**Invariant (the "leak" to guard):** the candle array must stay **strictly time-ascending and unique**, or lightweight-charts throws. Prepend-merge and bucket-rollover are the two danger spots; both get unit tests.

### 4.5 Order-book "glass" — `OrderBookProvider` per exchange

```ts
type OrderBookLevel = { price: number; size: number };
type OrderBook = { bids: OrderBookLevel[]; asks: OrderBookLevel[]; ts: number }; // top-N, desc bids / asc asks

interface OrderBookProvider {
  id: ExchangeId;
  open(selection, onUpdate: (book: OrderBook) => void, signal): void; // manages WS + normalization
}
```

- **Prefer full top-N snapshot channels** (no diff bookkeeping): Binance `@depth20@100ms`, OKX `books5`. Easy + robust → build first.
- **Snapshot + delta channels** (apply diffs, maintain a sorted map): Bybit `orderbook.50`, Coinbase Exchange `level2`, Kraken `book` (with checksum). More complex → sequence after the easy venues. Until a venue's delta path lands, the panel shows "Depth unavailable on {venue}".
- **UI throttle:** coalesce updates to one rAF paint. Panel renders top ~12–15 levels per side with depth bars (size-proportional), spread, and mid-price.

### 4.6 Layout with the order book

Right column becomes a vertical stack: **Order Book (top) · Trade Tape (bottom)**. Keeps the 3-column terminal at 1440px without crowding. Header / left sidebar / center chart unchanged in structure.

```
┌───────────────── Header (brand · price strip · live/latency/tps) ─────────────────┐
├──────────┬───────────────────────────────────────────┬──────────────────────────┤
│ Market   │  Chart  (OHLC HUD · crosshair · last tag)  │  Order Book  ("glass")   │
│ sidebar  │         (lazy-load pill at left edge)       ├──────────────────────────┤
│          │                                             │  Trade Tape              │
├──────────┴───────────────────────────────────────────┴──────────────────────────┤
│ Timeframe segmented control            ·            Drawing tool rail            │
└───────────────────────────────────────────────────────────────────────────────────┘
```

### 4.7 Visual system (liquid glass + glow)

- **Tokens:** glass fills (`rgba` + `backdrop-filter: blur() saturate()`), edge highlight (`inset 0 1px 0 rgba(255,255,255,.05)`), ambient drop shadow, accent ramps lime/cyan/amber/green/red.
- **Backdrop:** deep gradient with faint lime/cyan/green blooms; very slow "breathe" animation (reduced-motion-gated).
- **Components:** segmented timeframe control, glass tool rail with active glow + tooltips, glass market sidebar, header price strip with glow on `Last`, live status pulse, OHLC HUD chip on the chart, crosshair readout, left-edge loading shimmer pill.
- **Chart theme:** transparent chart background so the glass panel shows through subtly, but candles/grid tuned for legibility (data first).
- **Accessibility:** `@media (prefers-reduced-motion: reduce)` disables drift/pulse/shimmer; `@media (prefers-reduced-transparency: reduce)` swaps glass for solid panels. Focus-visible rings on all controls.

---

## 5. Data flow (end to end)

```
selection/timeframe change
   │
   ├─ history:  provider.fetchCandlePage ──(paginate)──► merge/dedupe/sort ──► committed Candle[] ──► series.setData
   │                                                                                   ▲
   │   scroll-back near left edge ── fetch older page ── prepend/dedupe ───────────────┘
   │
   ├─ live trades: WS ─► parse ─► buffer ─► rAF flush ─► applyTradeToCandles ─► forming bar ─► series.update
   │
   └─ order book: WS depth ─► normalize/apply-delta ─► throttle(rAF) ─► OrderBook ─► panel
```

---

## 6. Components & files

**New (domain):**
- `domain/providers/types.ts` — `CandleProvider`, `OrderBookProvider`, request/response types.
- `domain/providers/{binance,bybit,okx,coinbase,kraken}.ts` — candle (+ order-book) providers.
- `domain/providers/index.ts` — registry: `getCandleProvider(id)`, `getOrderBookProvider(id)`.
- `domain/paginate.ts` — `fetchHistoryWindow`, `mergeDedupeSort`, `prependCandles`.
- `domain/http.ts` — `httpGet` (Tauri http / fetch), `isTauri`.

**New (UI):**
- `components/OrderBook.tsx` — depth panel.
- `components/ChartHud.tsx` — OHLC legend + crosshair readout (or inline in TradingChart).
- `components/CommandSwitcher.tsx` *(optional, ⌘K market switcher)* — defer if time-boxed.

**Changed:**
- `hooks/useMarketFeed.ts` — paginated history, lazy-load API (`loadOlder`, `historyExhausted`, `loadingHistory`), committed-vs-forming split, order-book wiring.
- `components/TradingChart.tsx` — `series.update()` live path, visible-range subscription, prepend handling, HUD/crosshair, glass theme.
- `domain/candles.ts` — remove 720 cap (raise ceiling), keep bucketing.
- `domain/history.ts` — fold into providers or thin wrapper.
- `App.tsx` + `App.css` — new layout (order book), full glass restyle.
- `src-tauri/*` + `capabilities/default.json` — http plugin + allowed hosts.

---

## 7. Error handling

- **Page fetch fails:** non-blocking glass toast; keep loaded bars; allow retry; never blank the chart.
- **429 / rate limit:** sequential pagination self-limits; add small backoff on 429.
- **Venue lacks REST history (or Kraken cap):** label clearly; chart still works from the loaded window + live.
- **WS errors:** existing `connecting/live/stale/error` state machine, surfaced in the glass HUD.
- **Order-book gaps (delta venues):** on sequence gap / bad checksum, re-snapshot.
- **Unsorted/duplicate guard:** merge utilities enforce ascending-unique; covered by tests.

---

## 8. Testing (vitest)

Pure logic gets real coverage; chart/DOM stays manual.

- **Providers:** each `fetchCandlePage` normalizer against a captured sample payload → correct OHLCV, ordering, unit scaling, timeframe encoding.
- **Paginator:** `mergeDedupeSort` (overlap at page boundary, dupes, out-of-order); `fetchHistoryWindow` stops at target & at exhaustion (mocked provider).
- **Prepend:** `prependCandles` preserves ascending-unique; boundary bar dedup.
- **Bucketing:** `applyTradeToCandles` rollover + no front-truncation at large sizes.
- **Order book:** delta application + level pruning (for delta venues).
- Existing `domain/market.test.ts` stays green.

**Manual verification (run skill):** app opens to a full chart; scroll-back loads older bars with the pill; live last-price updates smoothly; order book streams; glass look matches mockup; reduced-motion/transparency fallbacks.

---

## 9. Performance

- 10k–60k candles: lightweight-charts handles this natively; the win is `update()` for the high-frequency path and `setData` only on infrequent events.
- Order book + tape throttled to rAF.
- `backdrop-filter` is GPU-cheap at this panel count; the breathe animation animates `opacity` only (compositor-friendly).

---

## 10. Risks & open questions

- **R1 — Per-venue REST drift.** Exact params/limits/ordering must be verified with live calls during implementation (TDD against captured payloads). Highest-risk: OKX `history-candles` cursor semantics, Coinbase ISO windowing, Kraken's forward-only `since`.
- **R2 — Kraken depth.** No CORS + ~720 cap + checksum order book. Sequence last; degrade gracefully.
- **R3 — Tauri http capability scope.** Must allowlist each exchange host; verify in a real `tauri dev` run (browser dev won't exercise the plugin path).
- **R4 — Mixed-venue consistency.** History and live both come from the *same* selected venue (no seam) — good. But sub-minute frames remain live-only on most venues.
- **R5 — Order-book delta venues** are the biggest net-new complexity; full top-N snapshot venues (Binance/OKX) land first to de-risk the panel.

---

## 11. Sequencing (for the plan)

1. `http.ts` + Tauri http plugin (CORS foundation).
2. `CandleProvider` interface + Binance provider + paginator + tests.
3. Remaining candle providers (Bybit, OKX, Coinbase, Kraken) + tests.
4. `useMarketFeed` refactor: paginated initial load + committed/forming split (remove 720 cap).
5. `TradingChart`: `update()` live path + visible-range lazy-load + prepend.
6. Glass redesign: tokens, backdrop, panels, controls, HUD, accessibility.
7. Order book: providers (snapshot venues first) + panel + layout.
8. Polish, manual verification, screenshots.
