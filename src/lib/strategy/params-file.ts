import { parsePineInputs, type PineInput } from "./jarvis.ts";
import { strategyWithParams } from "./source-params.ts";

/** params.txt: one `name = value` per line; `#` starts a comment. */
export function parseParamsFile(text: string): Record<string, number | boolean | string> {
  const out: Record<string, number | boolean | string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const m = line.match(/^([A-Za-z_]\w*)\s*=\s*(.+)$/);
    if (!m) continue;
    const v = m[2].trim();
    out[m[1]] = v === "true" ? true : v === "false" ? false : /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v.replace(/^["']|["']$/g, "");
  }
  return out;
}

export function formatParamsFile(params: PineInput[]): string {
  const lines = params.filter((p) => p.kind !== "source").map((p) => `${p.name} = ${p.value}   # ${p.title}`);
  return `# Parametry strategii — podmień ten plik, aby zmienić ustawienia.\n${lines.join("\n")}\n`;
}

/** Apply params.txt values on top of strategy source defaults; unknown names are ignored. */
export function applyParamsFile(code: string, text: string | undefined): string {
  if (!text) return code;
  const values = parseParamsFile(text);
  const params = parsePineInputs(code).map((p) => (p.name in values && p.kind !== "source" ? { ...p, value: values[p.name] } : p));
  return strategyWithParams(code, params);
}
