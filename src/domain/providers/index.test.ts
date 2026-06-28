import { describe, expect, it } from "vitest";
import { getCandleProvider } from "./index";

describe("getCandleProvider", () => {
  it("returns the matching provider for each venue", () => {
    expect(getCandleProvider("binance").id).toBe("binance");
    expect(getCandleProvider("bybit").id).toBe("bybit");
    expect(getCandleProvider("okx").id).toBe("okx");
    expect(getCandleProvider("coinbase").id).toBe("coinbase");
    expect(getCandleProvider("kraken").id).toBe("kraken");
  });
});
