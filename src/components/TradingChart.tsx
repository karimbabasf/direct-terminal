import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  createChart,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle, FeedState } from "../domain/types";
import { formatDuration, formatPrice } from "../utils/format";

export type DrawingMode = "cursor" | "trend" | "horizontal" | "measure";

type TradingChartProps = {
  candles: Candle[];
  feedState: FeedState;
  drawingMode: DrawingMode;
  clearSignal: number;
  onDrawingCountChange: (count: number) => void;
};

type Anchor = {
  time: UTCTimestamp;
  price: number;
};

type LineDrawing = {
  id: string;
  kind: "trend" | "measure";
  a: Anchor;
  b: Anchor;
};

type HorizontalDrawing = {
  id: string;
  kind: "horizontal";
  price: number;
};

type Drawing = LineDrawing | HorizontalDrawing;

type ChartBundle = {
  chart: IChartApi;
  series: ISeriesApi<"Candlestick">;
  container: HTMLDivElement;
};

type Size = {
  width: number;
  height: number;
};

export function TradingChart({
  candles,
  feedState,
  drawingMode,
  clearSignal,
  onDrawingCountChange,
}: TradingChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const previousCountRef = useRef(0);
  const [bundle, setBundle] = useState<ChartBundle | null>(null);
  const [drawings, setDrawings] = useState<Drawing[]>([]);

  const candleData = useMemo<CandlestickData<UTCTimestamp>[]>(
    () =>
      candles.map((candle) => ({
        time: candle.time,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      })),
    [candles],
  );

  const volumeData = useMemo<HistogramData<UTCTimestamp>[]>(
    () =>
      candles.map((candle) => ({
        time: candle.time,
        value: candle.volume,
        color:
          candle.close >= candle.open
            ? "rgba(32, 211, 132, 0.36)"
            : "rgba(255, 84, 92, 0.32)",
      })),
    [candles],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#05070a" },
        textColor: "#7f8b99",
        fontFamily:
          "Aptos, 'SF Pro Display', 'Segoe UI Variable', 'Helvetica Neue', sans-serif",
      },
      grid: {
        vertLines: { color: "rgba(92, 110, 125, 0.16)" },
        horzLines: { color: "rgba(92, 110, 125, 0.16)" },
      },
      rightPriceScale: {
        borderColor: "rgba(137, 151, 166, 0.22)",
        scaleMargins: { top: 0.12, bottom: 0.22 },
      },
      timeScale: {
        borderColor: "rgba(137, 151, 166, 0.22)",
        timeVisible: true,
        secondsVisible: true,
        rightOffset: 8,
        barSpacing: 9,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: "rgba(224, 235, 255, 0.42)",
          labelBackgroundColor: "#d7e04f",
        },
        horzLine: {
          color: "rgba(224, 235, 255, 0.42)",
          labelBackgroundColor: "#d7e04f",
        },
      },
      handleScale: true,
      handleScroll: true,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#20d384",
      downColor: "#ff545c",
      borderUpColor: "#20d384",
      borderDownColor: "#ff545c",
      wickUpColor: "#20d384",
      wickDownColor: "#ff545c",
      priceLineColor: "#d7e04f",
      priceLineWidth: 2,
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "",
      base: 0,
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    setBundle({ chart, series: candleSeries, container });

    const observer = new ResizeObserver(() => {
      chart.timeScale().fitContent();
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      setBundle(null);
    };
  }, []);

  useEffect(() => {
    candleSeriesRef.current?.setData(candleData);
    volumeSeriesRef.current?.setData(volumeData);
    if (candleData.length > 4 && previousCountRef.current === 0) {
      chartRef.current?.timeScale().fitContent();
    }
    previousCountRef.current = candleData.length;
  }, [candleData, volumeData]);

  useEffect(() => {
    setDrawings([]);
  }, [clearSignal]);

  useEffect(() => {
    onDrawingCountChange(drawings.length);
  }, [drawings.length, onDrawingCountChange]);

  return (
    <section className="chart-shell">
      <div className="chart-canvas" ref={containerRef} />
      {bundle ? (
        <DrawingLayer
          bundle={bundle}
          drawings={drawings}
          mode={drawingMode}
          onDrawingsChange={setDrawings}
        />
      ) : null}
      {candles.length === 0 ? (
        <div className="chart-empty">
          <strong>{feedState === "connecting" ? "Connecting" : "Awaiting tick"}</strong>
          <span>Direct stream is open once the first trade prints.</span>
        </div>
      ) : null}
    </section>
  );
}

type DrawingLayerProps = {
  bundle: ChartBundle;
  mode: DrawingMode;
  drawings: Drawing[];
  onDrawingsChange: (drawings: Drawing[]) => void;
};

function DrawingLayer({
  bundle,
  mode,
  drawings,
  onDrawingsChange,
}: DrawingLayerProps) {
  const [draft, setDraft] = useState<LineDrawing | null>(null);
  const [version, setVersion] = useState(0);
  const [size, setSize] = useState<Size>(() => ({
    width: bundle.container.clientWidth,
    height: bundle.container.clientHeight,
  }));

  useEffect(() => {
    const refresh = () => setVersion((value) => value + 1);
    bundle.chart.timeScale().subscribeVisibleTimeRangeChange(refresh);
    const observer = new ResizeObserver(() => {
      setSize({
        width: bundle.container.clientWidth,
        height: bundle.container.clientHeight,
      });
      refresh();
    });
    observer.observe(bundle.container);
    return () => {
      observer.disconnect();
      bundle.chart.timeScale().unsubscribeVisibleTimeRangeChange(refresh);
    };
  }, [bundle]);

  const pointerToAnchor = (event: PointerEvent<SVGSVGElement>) => {
    const point = pointerToLocal(event);
    const rawTime = bundle.chart.timeScale().coordinateToTime(point.x);
    const price = bundle.series.coordinateToPrice(point.y);
    if (typeof rawTime !== "number" || price === null) {
      return null;
    }
    return {
      time: rawTime as UTCTimestamp,
      price,
    };
  };

  const pointerToPrice = (event: PointerEvent<SVGSVGElement>) => {
    const point = pointerToLocal(event);
    return bundle.series.coordinateToPrice(point.y);
  };

  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (mode === "cursor") {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);

    if (mode === "horizontal") {
      const price = pointerToPrice(event);
      if (price !== null) {
        onDrawingsChange([
          ...drawings,
          { id: crypto.randomUUID(), kind: "horizontal", price },
        ]);
      }
      return;
    }

    const anchor = pointerToAnchor(event);
    if (!anchor) {
      return;
    }
    setDraft({
      id: crypto.randomUUID(),
      kind: mode,
      a: anchor,
      b: anchor,
    });
  };

  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (!draft) {
      return;
    }
    const anchor = pointerToAnchor(event);
    if (anchor) {
      setDraft({ ...draft, b: anchor });
    }
  };

  const onPointerUp = (event: PointerEvent<SVGSVGElement>) => {
    if (!draft) {
      return;
    }
    event.currentTarget.releasePointerCapture(event.pointerId);
    const start = toCoordinate(bundle, draft.a);
    const end = toCoordinate(bundle, draft.b);
    setDraft(null);
    if (!start || !end || distance(start, end) < 8) {
      return;
    }
    onDrawingsChange([...drawings, draft]);
  };

  const renderedDrawings = useMemo(
    () =>
      [...drawings, ...(draft ? [draft] : [])].map((drawing) =>
        renderDrawing(drawing, bundle, size),
      ),
    [bundle, drawings, draft, size, version],
  );

  return (
    <svg
      className={mode === "cursor" ? "drawing-layer passive" : "drawing-layer"}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      role="presentation"
      viewBox={`0 0 ${Math.max(size.width, 1)} ${Math.max(size.height, 1)}`}
    >
      {renderedDrawings}
    </svg>
  );
}

function pointerToLocal(event: PointerEvent<SVGSVGElement>) {
  const rect = event.currentTarget.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function toCoordinate(bundle: ChartBundle, anchor: Anchor) {
  const x = bundle.chart.timeScale().timeToCoordinate(anchor.time);
  const y = bundle.series.priceToCoordinate(anchor.price);
  return x === null || y === null ? null : { x, y };
}

function renderDrawing(drawing: Drawing, bundle: ChartBundle, size: Size) {
  if (drawing.kind === "horizontal") {
    const y = bundle.series.priceToCoordinate(drawing.price);
    if (y === null) {
      return null;
    }
    return (
      <g key={drawing.id}>
        <line className="drawing-line horizontal" x1={0} x2={size.width} y1={y} y2={y} />
        <text className="drawing-label" x={size.width - 92} y={y - 8}>
          {formatPrice(drawing.price)}
        </text>
      </g>
    );
  }

  const a = toCoordinate(bundle, drawing.a);
  const b = toCoordinate(bundle, drawing.b);
  if (!a || !b) {
    return null;
  }

  const isMeasure = drawing.kind === "measure";
  const labelX = (a.x + b.x) / 2;
  const labelY = (a.y + b.y) / 2 - 12;
  const delta = drawing.b.price - drawing.a.price;
  const percent = (delta / drawing.a.price) * 100;
  const elapsed = (drawing.b.time - drawing.a.time) * 1_000;

  return (
    <g key={drawing.id}>
      <line
        className={isMeasure ? "drawing-line measure" : "drawing-line"}
        x1={a.x}
        x2={b.x}
        y1={a.y}
        y2={b.y}
      />
      <circle className="drawing-node" cx={a.x} cy={a.y} r={4} />
      <circle className="drawing-node" cx={b.x} cy={b.y} r={4} />
      {isMeasure ? (
        <text className="drawing-label measure" x={labelX} y={labelY}>
          {formatPrice(delta)} / {percent.toFixed(2)}% / {formatDuration(elapsed)}
        </text>
      ) : null}
    </g>
  );
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
