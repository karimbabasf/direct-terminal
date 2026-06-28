// Pure decision logic for how a candlestick series should react to a new
// snapshot of candles. Extracted from the chart component so the viewport
// behavior is unit-testable: the cardinal rule is that live growth on the
// right edge must NEVER reset the user's zoom/scroll position.

export type ChartFrame = {
  len: number;
  first?: number; // time of the first (oldest) bar
  last?: number; // time of the last (newest) bar
};

export type ChartUpdatePlan =
  | { type: "empty" }
  // Append/replace tail bars starting at fromIndex; preserve viewport.
  | { type: "tail"; fromIndex: number }
  // Older bars were prepended; shift the visible range right by `shift`.
  | { type: "prepend"; shift: number }
  // Initial load or full swap: set data and frame the recent window.
  | { type: "reset" };

export function classifyChartUpdate(
  prev: ChartFrame,
  next: ChartFrame,
): ChartUpdatePlan {
  if (next.len === 0) return { type: "empty" };
  if (prev.len === 0 || prev.first === undefined || prev.last === undefined) {
    return { type: "reset" };
  }

  const sameLeftEdge = next.first === prev.first;
  const grewOrHeldRight = next.last !== undefined && next.last >= prev.last;

  // Live tail: same oldest bar, newest moved forward (or the forming bar changed
  // in place), and the series did not shrink. Covers +1, +N (gap-fill /
  // carry-forward) and in-place forming-bar updates — all without a zoom reset.
  if (sameLeftEdge && grewOrHeldRight && next.len >= prev.len) {
    // If new bars were appended, also refresh the previously-forming bar (it may
    // have just finalized); otherwise only the last bar changed in place.
    const fromIndex = next.len > prev.len ? prev.len - 1 : next.len - 1;
    return { type: "tail", fromIndex: Math.max(0, fromIndex) };
  }

  // Prepend: oldest bar changed, newest unchanged, series grew.
  if (!sameLeftEdge && next.last === prev.last && next.len > prev.len) {
    return { type: "prepend", shift: next.len - prev.len };
  }

  return { type: "reset" };
}
