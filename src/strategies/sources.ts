// App-only: bundles each strategy.txt with its params.txt (latest settings) so the chart works without uploading.
import { applyParamsFile } from "@/lib/strategy/params-file";

const files = import.meta.glob("./*/strategy.txt", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const paramFiles = import.meta.glob("./*/params.txt", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

export const STRATEGY_SOURCES: Record<string, string> = Object.fromEntries(
  Object.entries(files).map(([p, code]) => {
    const id = p.split("/")[1];
    return [id, applyParamsFile(code, paramFiles[`./${id}/params.txt`])];
  }),
);
