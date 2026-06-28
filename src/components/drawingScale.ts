// Maps between a chart's "logical" coordinate (a fractional bar index, where
// integer i is the i-th candle) and absolute time, by extrapolating a uniform
// bar interval. This is what lets drawings live in the empty space to the right
// of the last candle (and the left of the first): lightweight-charts'
// coordinateToTime / timeToCoordinate return null out there, but logical
// coordinates extend infinitely. So we anchor every drawing in absolute time
// via this linear model and round-trip it back to pixels on each render — a
// drawing dropped on whitespace stays put, and stays valid even after older
// bars are prepended (time is absolute; logical indices are not).

export type DrawingScale = {
  baseIndex: number; // logical index whose time is baseTime (always 0 here)
  baseTime: number; // time (seconds) of the bar at baseIndex
  secondsPerBar: number; // uniform spacing between adjacent bars
};

const FALLBACK_SECONDS_PER_BAR = 60;

// Derive a linear time<->logical model from candle times. Uses the average
// spacing across the whole series so a single irregular gap can't skew it.
export function deriveDrawingScale(times: number[]): DrawingScale | null {
  if (times.length === 0) return null;
  const baseTime = times[0];
  const span = times[times.length - 1] - baseTime;
  const secondsPerBar =
    times.length >= 2 && span > 0
      ? span / (times.length - 1)
      : FALLBACK_SECONDS_PER_BAR;
  return { baseIndex: 0, baseTime, secondsPerBar };
}

// logical (fractional bar index) -> absolute time (seconds).
export function timeFromLogical(scale: DrawingScale, logical: number): number {
  return scale.baseTime + (logical - scale.baseIndex) * scale.secondsPerBar;
}

// absolute time (seconds) -> logical (fractional bar index).
export function logicalFromTime(scale: DrawingScale, time: number): number {
  return scale.baseIndex + (time - scale.baseTime) / scale.secondsPerBar;
}
