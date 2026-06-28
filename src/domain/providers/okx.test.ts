import { describe, expect, it } from "vitest";
import { okxCandleProvider, parseOkxCandles } from "./okx";

const SAMPLE = {
  code: "0",
  data: [
    ["1700000060000", "105", "120", "104", "118", "8.0", "1"],
    ["1700000000000", "100", "110", "90", "105", "12.5", "1"],
  ],
};

describe("parseOkxCandles", () => {
  it("reverses newest-first into ascending candles in seconds", () => {
    const out = parseOkxCandles(SAMPLE);
    expect(out.map((c) => c.time)).toEqual([1700000000, 1700000060]);
    expect(out[1].close).toBe(118);
  });
});

describe("okxCandleProvider", () => {
  it("page cap is 300 and maps frames to OKX bars", () => {
    expect(okxCandleProvider.pageLimit).toBe(300);
    expect(okxCandleProvider.supports("4h")).toBe(true);
    expect(okxCandleProvider.supports("1s")).toBe(false);
  });
});
