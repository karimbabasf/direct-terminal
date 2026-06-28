import { CircleDot, DatabaseZap, SlidersHorizontal } from "lucide-react";
import { ASSETS, type Asset, type Quote } from "../domain/types";
import {
  EXCHANGE_META,
  EXCHANGES,
  getAvailableQuotes,
  getMarketsForAsset,
  marketLabel,
  normalizeSelection,
  type ExchangeId,
  type MarketSelection,
} from "../domain/exchanges";

type MarketSidebarProps = {
  selection: MarketSelection;
  onSelectionChange: (selection: MarketSelection) => void;
  historyNote: string;
  error: string | null;
};

export function MarketSidebar({
  selection,
  onSelectionChange,
  historyNote,
  error,
}: MarketSidebarProps) {
  const markets = getMarketsForAsset(selection.base);
  const quotes = getAvailableQuotes(selection.exchange, selection.base);

  const setBase = (base: Asset) => {
    onSelectionChange(normalizeSelection({ ...selection, base }));
  };

  const setExchange = (exchange: ExchangeId) => {
    onSelectionChange(normalizeSelection({ ...selection, exchange }));
  };

  const setQuote = (quote: Quote) => {
    onSelectionChange(normalizeSelection({ ...selection, quote }));
  };

  return (
    <aside className="market-sidebar">
      <div className="panel-title">
        <SlidersHorizontal size={16} />
        <span>Market</span>
      </div>

      <div className="asset-switch" aria-label="Asset selector">
        {ASSETS.map((asset) => (
          <button
            className={asset === selection.base ? "is-active" : ""}
            key={asset}
            onClick={() => setBase(asset)}
            type="button"
          >
            {asset}
          </button>
        ))}
      </div>

      <label className="field-label" htmlFor="quote-select">
        Quote
      </label>
      <select
        id="quote-select"
        value={selection.quote}
        onChange={(event) => setQuote(event.currentTarget.value as Quote)}
      >
        {quotes.map((quote) => (
          <option key={quote} value={quote}>
            {quote}
          </option>
        ))}
      </select>

      <div className="exchange-list" aria-label="Exchange selector">
        {EXCHANGES.map((exchange) => {
          const meta = EXCHANGE_META[exchange];
          return (
            <button
              className={exchange === selection.exchange ? "exchange-row active" : "exchange-row"}
              key={exchange}
              onClick={() => setExchange(exchange)}
              type="button"
            >
              <span>
                <CircleDot size={15} />
                {meta.name}
              </span>
              <small>{meta.venue}</small>
            </button>
          );
        })}
      </div>

      <section className="source-readout" aria-label="Feed source">
        <div className="panel-title">
          <DatabaseZap size={16} />
          <span>Source</span>
        </div>
        <p>
          {EXCHANGE_META[selection.exchange].source} for {marketLabel(selection)}.
        </p>
        <p>{EXCHANGE_META[selection.exchange].quality}</p>
        <p>{historyNote}</p>
        {error ? <p className="error-text">{error}</p> : null}
      </section>

      <section className="venue-matrix" aria-label="Available markets">
        <div className="panel-title">
          <span>Routes</span>
        </div>
        {markets.map((market) => (
          <span
            className={
              market.exchange === selection.exchange && market.quote === selection.quote
                ? "route-chip active"
                : "route-chip"
            }
            key={`${market.exchange}-${market.quote}`}
          >
            {EXCHANGE_META[market.exchange].name} {market.quote}
          </span>
        ))}
      </section>
    </aside>
  );
}
