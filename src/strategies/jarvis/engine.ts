import { isJarvisStrategy, parseStrategyColors, runJarvis } from "../../lib/strategy/jarvis.ts";
import type { StrategyEngine } from "../types.ts";

const engine: StrategyEngine = {
  id: "jarvis",
  name: "Ichimoku + HullMA + Hull MACD + Jarvis RM + Sideways Filter",
  detect: isJarvisStrategy,
  parseColors: parseStrategyColors,
  run: runJarvis,
};
export default engine;
