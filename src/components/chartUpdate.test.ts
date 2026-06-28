import { describe, expect, it } from "vitest";
import { classifyChartUpdate } from "./chartUpdate";

describe("classifyChartUpdate", () => {
  it("resets on initial load (no previous bars)", () => {
    expect(classifyChartUpdate({ len: 0 }, { len: 200, first: 1, last: 200 })).toEqual({
      type: "reset",
    });
  });

  it("reports empty when the next snapshot has no bars", () => {
    expect(classifyChartUpdate({ len: 5, first: 1, last: 5 }, { len: 0 })).toEqual({
      type: "empty",
    });
  });

  it("treats an in-place forming-bar update as a tail (preserve viewport)", () => {
    // Same length, last bar mutated in place.
    const plan = classifyChartUpdate(
      { len: 100, first: 1, last: 100 },
      { len: 100, first: 1, last: 100 },
    );
    expect(plan).toEqual({ type: "tail", fromIndex: 99 });
  });

  it("treats a single appended bar as a tail starting at the prior forming bar", () => {
    const plan = classifyChartUpdate(
      { len: 100, first: 1, last: 100 },
      { len: 101, first: 1, last: 101 },
    );
    expect(plan).toEqual({ type: "tail", fromIndex: 99 });
  });

  it("treats multi-bar growth (gap-fill / carry-forward) as a tail, NOT a reset", () => {
    // This is the zoom-reset bug: several flat candles appear at once.
    const plan = classifyChartUpdate(
      { len: 100, first: 1, last: 100 },
      { len: 105, first: 1, last: 105 },
    );
    expect(plan).toEqual({ type: "tail", fromIndex: 99 });
  });

  it("shifts the viewport when older bars are prepended", () => {
    const plan = classifyChartUpdate(
      { len: 100, first: 50, last: 149 },
      { len: 130, first: 20, last: 149 },
    );
    expect(plan).toEqual({ type: "prepend", shift: 30 });
  });

  it("resets on a full swap (both edges changed)", () => {
    const plan = classifyChartUpdate(
      { len: 100, first: 1, last: 100 },
      { len: 200, first: 5000, last: 5199 },
    );
    expect(plan).toEqual({ type: "reset" });
  });

  it("resets when the series shrinks (e.g. timeframe change)", () => {
    const plan = classifyChartUpdate(
      { len: 100, first: 1, last: 100 },
      { len: 40, first: 1, last: 40 },
    );
    expect(plan).toEqual({ type: "reset" });
  });
});
