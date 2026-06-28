import { Layers } from "lucide-react";
import type { OrderBook as Book, OrderBookLevel } from "../domain/orderbook";
import type { FeedState } from "../domain/types";
import { formatPrice } from "../utils/format";

type OrderBookProps = {
  book: Book | null;
  status: FeedState;
  available: boolean;
};

function formatSize(size: number): string {
  if (size >= 1000) return size.toFixed(0);
  if (size >= 1) return size.toFixed(3);
  return size.toFixed(4);
}

export function OrderBook({ book, status, available }: OrderBookProps) {
  const bids = book?.bids ?? [];
  const asks = book?.asks ?? [];
  const maxSize = Math.max(
    1e-9,
    ...bids.map((l) => l.size),
    ...asks.map((l) => l.size),
  );
  const bestBid = bids[0]?.price;
  const bestAsk = asks[0]?.price;
  const mid = bestBid && bestAsk ? (bestBid + bestAsk) / 2 : undefined;
  const spread = bestBid && bestAsk ? bestAsk - bestBid : undefined;
  const spreadPct = mid && spread ? (spread / mid) * 100 : undefined;

  const row = (level: OrderBookLevel, side: "bid" | "ask") => (
    <div className={`ob-row ${side}`} key={`${side}${level.price}`}>
      <span className="ob-bar" style={{ width: `${(level.size / maxSize) * 100}%` }} />
      <span className="ob-price">{formatPrice(level.price)}</span>
      <span className="ob-size">{formatSize(level.size)}</span>
    </div>
  );

  return (
    <aside className="order-book" aria-label="Order book">
      <div className="panel-title">
        <Layers size={15} />
        <span>Order Book</span>
      </div>

      {!available ? (
        <div className="ob-empty">Depth unavailable on this venue.</div>
      ) : !book ? (
        <div className="ob-empty">
          {status === "error" ? "Depth stream error." : "Loading depth…"}
        </div>
      ) : (
        <>
          <div className="ob-head">
            <span>Price</span>
            <span>Size</span>
          </div>
          <div className="ob-side asks">{[...asks].reverse().map((l) => row(l, "ask"))}</div>
          <div className="ob-mid">
            <strong>{formatPrice(mid)}</strong>
            <span>
              spread {spread !== undefined ? formatPrice(spread) : "--"}
              {spreadPct !== undefined ? ` · ${spreadPct.toFixed(3)}%` : ""}
            </span>
          </div>
          <div className="ob-side bids">{bids.map((l) => row(l, "bid"))}</div>
        </>
      )}
    </aside>
  );
}
