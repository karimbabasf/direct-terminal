import { useState } from "react";
import "./App.css";
import { MarketSidebar } from "./components/MarketSidebar";
import { TerminalHeader } from "./components/TerminalHeader";
import { TimeframeBar } from "./components/TimeframeBar";
import { ToolRail } from "./components/ToolRail";
import { TradeTape } from "./components/TradeTape";
import { TradingChart, type DrawingMode } from "./components/TradingChart";
import type { MarketSelection } from "./domain/exchanges";
import type { Timeframe } from "./domain/types";
import { useMarketFeed } from "./hooks/useMarketFeed";

function App() {
  const [selection, setSelection] = useState<MarketSelection>({
    exchange: "binance",
    base: "BTC",
    quote: "USDT",
  });
  const [timeframe, setTimeframe] = useState<Timeframe>("1m");
  const [drawingMode, setDrawingMode] = useState<DrawingMode>("cursor");
  const [clearSignal, setClearSignal] = useState(0);
  const [drawingCount, setDrawingCount] = useState(0);
  const telemetry = useMarketFeed(selection, timeframe);

  return (
    <main className="terminal-app">
      <TerminalHeader
        selection={selection}
        telemetry={telemetry}
        timeframe={timeframe}
      />

      <div className="terminal-grid">
        <MarketSidebar
          error={telemetry.error}
          historyNote={telemetry.historyNote}
          onSelectionChange={setSelection}
          selection={selection}
        />

        <section className="workspace" aria-label="Chart workspace">
          <div className="workspace-bar">
            <TimeframeBar onChange={setTimeframe} value={timeframe} />
            <ToolRail
              drawingCount={drawingCount}
              mode={drawingMode}
              onClear={() => setClearSignal((value) => value + 1)}
              onModeChange={setDrawingMode}
            />
          </div>
          <TradingChart
            candles={telemetry.candles}
            clearSignal={clearSignal}
            drawingMode={drawingMode}
            feedState={telemetry.state}
            loadingHistory={telemetry.loadingHistory}
            onDrawingCountChange={setDrawingCount}
            onLoadOlder={telemetry.loadOlder}
          />
        </section>

        <TradeTape trades={telemetry.recentTrades} />
      </div>
    </main>
  );
}

export default App;
