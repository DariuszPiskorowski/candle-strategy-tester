// App-only: bundles each strategy.txt (latest best settings) so the chart works without uploading.
const files = import.meta.glob("./*/strategy.txt", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

export const STRATEGY_SOURCES: Record<string, string> = Object.fromEntries(
  Object.entries(files).map(([p, code]) => [p.split("/")[1], code]),
);
