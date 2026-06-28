// CORS-safe HTTP. In the Tauri app we route through the native HTTP plugin
// (no browser CORS); in a plain browser (dev) we fall back to window.fetch.

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function httpGetJson<T = unknown>(
  url: string,
  signal?: AbortSignal,
): Promise<T> {
  if (isTauri()) {
    const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
    const response = await tauriFetch(url, { method: "GET", signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }
    return (await response.json()) as T;
  }

  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return (await response.json()) as T;
}
