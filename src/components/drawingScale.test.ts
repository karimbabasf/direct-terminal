import { describe, expect, it } from "vitest";
import {
  deriveDrawingScale,
  logicalFromTime,
  timeFromLogical,
} from "./drawingScale";

describe("deriveDrawingScale", () => {
  it("returns null when there are no candles", () => {
    expect(deriveDrawingScale([])).toBeNull();
  });

  it("falls back to a default spacing for a single candle", () => {
    const scale = deriveDrawingScale([1000]);
    expect(scale).toEqual({ baseIndex: 0, baseTime: 1000, secondsPerBar: 60 });
  });

  it("derives uniform spacing from evenly-spaced candles", () => {
    const scale = deriveDrawingScale([1000, 1005, 1010, 1015]);
    expect(scale).toEqual({ baseIndex: 0, baseTime: 1000, secondsPerBar: 5 });
  });

  it("averages spacing so one irregular gap cannot skew it", () => {
    // 4 intervals over a 40s span = 10s/bar average, even though one gap is 25s.
    const scale = deriveDrawingScale([0, 5, 10, 35, 40]);
    expect(scale).toEqual({ baseIndex: 0, baseTime: 0, secondsPerBar: 10 });
  });
});

describe("logical <-> time round-trip", () => {
  const scale = { baseIndex: 0, baseTime: 1000, secondsPerBar: 5 };

  it("maps an integer logical index to its candle time", () => {
    expect(timeFromLogical(scale, 0)).toBe(1000);
    expect(timeFromLogical(scale, 3)).toBe(1015);
  });

  it("extrapolates time into the whitespace past the last candle", () => {
    // 10 bars past the last index is still a valid (future) time.
    expect(timeFromLogical(scale, 110)).toBe(1550);
  });

  it("extrapolates time before the first candle (negative logical)", () => {
    expect(timeFromLogical(scale, -4)).toBe(980);
  });

  it("round-trips logical -> time -> logical exactly", () => {
    for (const logical of [-12.5, 0, 7.25, 250]) {
      expect(logicalFromTime(scale, timeFromLogical(scale, logical))).toBeCloseTo(
        logical,
        9,
      );
    }
  });
});
