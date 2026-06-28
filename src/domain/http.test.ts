import { afterEach, describe, expect, it, vi } from "vitest";
import { httpGetJson, isTauri } from "./http";

afterEach(() => vi.restoreAllMocks());

describe("isTauri", () => {
  it("is false in the node/browser test env", () => {
    expect(isTauri()).toBe(false);
  });
});

describe("httpGetJson", () => {
  it("uses window.fetch and returns parsed JSON when not in Tauri", async () => {
    const json = [{ a: 1 }];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(json) }),
    );
    await expect(httpGetJson("https://example.com")).resolves.toEqual(json);
  });

  it("throws on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 429, json: () => Promise.resolve({}) }),
    );
    await expect(httpGetJson("https://example.com")).rejects.toThrow("429");
  });
});
