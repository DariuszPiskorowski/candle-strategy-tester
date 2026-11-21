/** Quantity is fixed on the signal close, exactly as in the uploaded strategy. */
export function positionQty(equity: number, close: number, target: number, exchangeLeverage: number, step: number, minimum: number): number {
  if (![equity, close, target, exchangeLeverage, step, minimum].every(Number.isFinite) || equity <= 0 || close <= 0 || target <= 0 || step <= 0 || exchangeLeverage < 1 || exchangeLeverage > 20 || minimum < 0) return 0;
  const q = Math.floor(Math.min(target, exchangeLeverage) * equity / close / step + 1e-9) * step;
  return q >= minimum && q > 0 ? q : 0;
}
/** SOL's current Hyperliquid maintenance tiers; historical mark prices are unavailable. */
export function maintenanceMargin(notional: number): number {
  return notional <= 70_000_000 ? notional * 0.025 : notional * 0.05 - 1_750_000;
}
export function estimatedLiquidation(side: 'BUY' | 'SELL', entry: number, qty: number, collateral: number): number {
  const direction = side === 'BUY' ? 1 : -1;
  const buffer = (price: number) => collateral + direction * qty * (price-entry) - maintenanceMargin(qty*price);
  let lo = 0, hi = side === 'BUY' ? entry : entry + Math.max(1, collateral / qty) * 4;
  if (side === 'BUY' && buffer(0) >= 0) return NaN;
  if (buffer(entry) <= 0) return entry;
  for (let i=0; i<80; i++) {
    const mid=(lo+hi)/2;
    if ((buffer(mid) > 0) === (side === 'BUY')) hi=mid; else lo=mid;
  }
  return (lo+hi)/2;
}
