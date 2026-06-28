export function num(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

// Accepts a unix time in seconds or milliseconds and returns whole seconds.
export function secFromMs(value: unknown): number | null {
  const n = num(value);
  if (n === null) return null;
  return Math.floor(n > 10_000_000_000 ? n / 1000 : n);
}
