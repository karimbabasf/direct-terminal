<div align="center">

# ◈ Direct Terminal

### A glass-pane view into the markets.

A liquid-glass desktop crypto terminal — deep multi-exchange candle history, TradingView-style infinite scroll-back, a live trade tape, and a live order-book "glass." Built with Tauri + React.

`Tauri 2` · `React 19` · `TypeScript` · `Vite 7` · `lightweight-charts v5`

</div>

---

## What it is

Direct Terminal connects **directly** to public exchange APIs (no middle-man backend) and renders a fast, dense, beautiful market view across **five venues** — Binance, Coinbase, Kraken, OKX, and Bybit. Candles stream live from each exchange's trade feed and are backfilled with deep REST history so you open to a *full* chart, not an empty one.

> **Status:** active development. The redesign is shipping in phases (see [Roadmap](#roadmap)). The original app is a working dark terminal; the liquid-glass overhaul, deep history, infinite scroll, and order book land branch by branch.

## Features

**Now**
- 📈 Candlestick + volume chart powered by `lightweight-charts`
- 🔌 Direct WebSocket trade streams from 5 exchanges
- 🧮 Live trade → candle aggregation across 12 timeframes (1s → 1d)
- ✏️ On-chart drawing tools (trend line, horizontal, measure)
- 📼 Live trade tape

**Shipping (see Roadmap)**
- 🕰️ **Deep history** — up to 10,000+ candles per market, fetched per-exchange and CORS-safe via Tauri's native HTTP
- ♾️ **Infinite scroll-back** — older candles load as you scroll, TradingView-style
- 🪟 **Liquid-glass UI** — frosted panels, an ambient market glow, an OHLC heads-up display, and modern controls
- 📖 **Order-book "glass"** — live depth panel with bids/asks, spread, and mid

## Quick start

**Prerequisites:** [pnpm](https://pnpm.io), [Rust](https://www.rust-lang.org/tools/install) + the [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/).

```bash
pnpm install

# Run the full desktop app (recommended — exercises native HTTP, no CORS limits)
pnpm tauri dev

# Or run just the web frontend in a browser (fast; some venues are CORS-limited here)
pnpm dev

# Tests
pnpm test

# Production build
pnpm build          # type-check + bundle frontend
pnpm tauri build    # package the desktop app
```

## Architecture

Data flows in one direction, with the high-frequency live path kept separate from the heavy history path so the chart stays at 60fps with 10k+ candles:

```
selection / timeframe
   ├─ history:  CandleProvider.fetchCandlePage ─(paginate backward)─► merge/dedupe/sort ─► series.setData
   │      scroll-back ── fetch older page ── prepend/dedupe ──────────────────────────────┘
   ├─ live:     WebSocket trades ─► parse ─► buffer ─► rAF flush ─► forming bar ─► series.update()
   └─ depth:    WebSocket order book ─► normalize ─► throttle(rAF) ─► order-book panel
```

- **`src/domain/`** — pure, testable market logic: exchange feeds, per-exchange candle providers, the paginator, and candle aggregation. No React here.
- **`src/hooks/useMarketFeed.ts`** — the data engine that wires history + live streams into React state.
- **`src/components/`** — the UI: chart, sidebar, header, tape, order book.
- **`src-tauri/`** — the Rust/Tauri shell (native HTTP for CORS-free REST, window config).

## Project structure

```
src/
  domain/        market types, exchanges, candle providers, paginator, aggregation (unit-tested)
  hooks/         useMarketFeed — the data engine
  components/    TradingChart, MarketSidebar, TerminalHeader, TradeTape, OrderBook, …
  utils/         formatting helpers
src-tauri/       Tauri 2 desktop shell (Rust)
docs/superpowers/
  specs/         design specs
  plans/         phased implementation plans
```

## Roadmap

The redesign ships as four reviewable phases, each on its own branch + PR:

| Phase | Branch | What lands |
|------|--------|-----------|
| 1 | `feat/candle-history-engine` | Per-exchange REST providers + backward paginator + CORS-safe HTTP |
| 2 | `feat/deep-chart-lazyload` | 10k-candle history + TradingView scroll-back + 60fps live updates |
| 3 | `feat/liquid-glass-ui` | Whole-terminal glass redesign, signature glow, OHLC HUD |
| 4 | `feat/order-book` | Live order-book depth panel |

Design docs: [spec](docs/superpowers/specs/2026-06-27-glass-terminal-design.md) · [Phase 1 plan](docs/superpowers/plans/2026-06-28-candle-history-engine.md).

## Development workflow

- `main` stays stable. Each feature lands via a branch → pull request.
- Domain logic is built test-first (`pnpm test`, vitest).
- Conventional-commit style messages (`feat:`, `fix:`, `refactor:`…).

## Disclaimer

Market-data viewer for research and education. **Not** financial advice, and it places no orders — read-only data only.
