import type { TradeTick } from "../domain/types";
import { formatPrice } from "../utils/format";

type TradeTapeProps = {
  trades: TradeTick[];
};

export function TradeTape({ trades }: TradeTapeProps) {
  return (
    <aside className="trade-tape" aria-label="Live trade tape">
      <div className="panel-title">
        <span>Tape</span>
      </div>
      <div className="tape-head">
        <span>Time</span>
        <span>Price</span>
        <span>Size</span>
      </div>
      <div className="tape-list">
        {trades.map((trade, index) => (
          <div className="tape-row" key={`${trade.timestamp}-${index}`}>
            <span>
              {new Date(trade.timestamp).toLocaleTimeString(undefined, {
                hour12: false,
              })}
            </span>
            <strong>{formatPrice(trade.price)}</strong>
            <span>{trade.size.toFixed(trade.size >= 1 ? 3 : 6)}</span>
          </div>
        ))}
        {trades.length === 0 ? (
          <div className="tape-empty">Waiting for the first exchange tick.</div>
        ) : null}
      </div>
    </aside>
  );
}
