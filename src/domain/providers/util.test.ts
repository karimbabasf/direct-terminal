import { describe, expect, it } from "vitest";
import { num, secFromMs } from "./util";

describe("num", () => {
  it("parses numbers and numeric strings, rejects junk", () => {
    expect(num(12.5)).toBe(12.5);
    expect(num("0.001")).toBe(0.001);
    expect(num("abc")).toBeNull();
    expect(num(null)).toBeNull();
  });
});

describe("secFromMs", () => {
  it("passes seconds through and floors", () => {
    expect(secFromMs(1_700_000_000)).toBe(1_700_000_000);
  });
  it("converts ms to seconds", () => {
    expect(secFromMs(1_700_000_000_000)).toBe(1_700_000_000);
  });
  it("accepts numeric strings", () => {
    expect(secFromMs("1700000000000")).toBe(1_700_000_000);
  });
});
