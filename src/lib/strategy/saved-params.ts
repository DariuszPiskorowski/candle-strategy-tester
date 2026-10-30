import type { PineInput } from "./jarvis";

type SettingsStorage = Pick<Storage, "getItem" | "setItem">;
const key = (strategyId: string) => `candlelab-strategy-params:${strategyId}`;

export function saveStrategyParams(storage: SettingsStorage, strategyId: string, params: PineInput[]) {
  storage.setItem(key(strategyId), JSON.stringify(Object.fromEntries(params.map((p) => [p.name, p.value]))));
}

export function restoreStrategyParams(storage: SettingsStorage, strategyId: string, defaults: PineInput[]): PineInput[] {
  try {
    const raw = storage.getItem(key(strategyId));
    if (!raw) return defaults;
    const values: unknown = JSON.parse(raw);
    if (!values || typeof values !== "object" || Array.isArray(values)) return defaults;
    return defaults.map((p) => {
      const value = (values as Record<string, unknown>)[p.name];
      if (typeof value !== typeof p.value || (typeof value === "number" && !Number.isFinite(value))) return p;
      return { ...p, value: value as PineInput["value"] };
    });
  } catch {
    return defaults;
  }
}