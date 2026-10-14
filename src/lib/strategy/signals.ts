export type IndicatorSignal = {
  name: string;
  signal: "BUY" | "SELL" | "BOCZNY" | "BRAK DANYCH";
};

/** All comparisons must agree; missing values are not a sideways signal. */
export function indicatorSignal(name: string, comparisons: [number, number][]): IndicatorSignal {
  if (!comparisons.length || comparisons.some(([a, b]) => !Number.isFinite(a) || !Number.isFinite(b))) {
    return { name, signal: "BRAK DANYCH" };
  }
  if (comparisons.every(([a, b]) => a > b)) return { name, signal: "BUY" };
  if (comparisons.every(([a, b]) => a < b)) return { name, signal: "SELL" };
  return { name, signal: "BOCZNY" };
}