// Rejestr strategii. Nowa strategia = nowy folder src/strategies/<id>/ (engine.ts + strategy.txt)
// i jedna linia poniżej. Aktywną strategię wybiera src/strategies/active.json.
import jarvis from "./jarvis/engine.ts";
import active from "./active.json" with { type: "json" };
import type { StrategyEngine } from "./types.ts";

export const ENGINES: StrategyEngine[] = [jarvis];
export const ACTIVE_STRATEGY_ID: string = active.active;

export const getEngine = (id: string) => ENGINES.find((e) => e.id === id);
export const detectEngine = (code: string) => ENGINES.find((e) => e.detect(code));
