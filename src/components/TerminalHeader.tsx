import { Activity, Radio, Wifi, WifiOff, Zap } from "lucide-react";
import type { FeedTelemetry } from "../hooks/useMarketFeed";
import { candleChange } from "../domain/candles";
import { EXCHANGE_META, type MarketSelection } from "../domain/exchanges";
import type { Timeframe } from "../domain/types";
import {
  formatCompact,
  formatLatency,
  formatPrice,
  formatSignedPercent,
} from "../utils/format";

type TerminalHeaderProps = {
  selection: MarketSelection;
  timeframe: Timeframe;
  telemetry: FeedTelemetry;
};

export function TerminalHeader({
  selection,
  timeframe,
  telemetry,
}: TerminalHeaderProps) {
  const last = telemetry.lastTrade?.price;
  const change = candleChange(telemetry.candles);
  const isLive = telemetry.state === "live";
  const exchange = EXCHANGE_META[selection.exchange];

  return (
    <header className="terminal-header">
      <div className="brand-lockup">
        <div className="brand-mark" aria-hidden="true">
          <Activity size={18} />
        </div>
        <div>
          <p className="eyebrow">Direct exchange terminal</p>
          <h1>
            {selection.base}/{selection.quote}
            <span>{exchange.name}</span>
          </h1>
        </div>
      </div>

      <section className="price-strip" aria-label="Market telemetry">
        <div className="price-block primary">
          <span>Last</span>
          <strong>{formatPrice(last)}</strong>
        </div>
        <div className={change >= 0 ? "price-block positive" : "price-block negative"}>
          <span>Window</span>
          <strong>{formatSignedPercent(change)}</strong>
        </div>
        <div className="price-block">
          <span>Frame</span>
          <strong>{timeframe}</strong>
        </div>
        <div className="price-block">
          <span>Ticks</span>
          <strong>{formatCompact(telemetry.totalTrades)}</strong>
        </div>
      </section>

      <div className="header-status">
        <div className={isLive ? "status-pill live" : "status-pill"}>
          {isLive ? <Wifi size={15} /> : <WifiOff size={15} />}
          <span>{telemetry.state}</span>
        </div>
        <div className="status-metric" title="Wall-clock delta from exchange trade timestamp">
          <Zap size={15} />
          <span>{formatLatency(telemetry.latencyMs)}</span>
        </div>
        <div className="status-metric">
          <Radio size={15} />
          <span>{telemetry.tradesPerSecond}/s</span>
        </div>
      </div>
    </header>
  );
}
