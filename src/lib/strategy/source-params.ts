import type { PineInput } from "./jarvis";

/** Change input defaults only; leave formulas, metadata and plot colors intact. */
export function strategyWithParams(code: string, params: PineInput[]): string {
  let next = code;
  for (const param of params) {
    if (param.kind === "source") continue;
    if (typeof param.value === "number" && !Number.isFinite(param.value)) {
      throw new Error(`Nieprawidłowa wartość: ${param.title}`);
    }
    const name = param.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`^(\\s*${name}\\s*=\\s*input\\.${param.kind}\\(\\s*)(?:"(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*'|[^,)\\r\\n]+)`, "m");
    if (!pattern.test(next)) throw new Error(`Nie znaleziono parametru: ${param.title}`);
    next = next.replace(pattern, (_match, prefix: string) => prefix + JSON.stringify(param.value));
  }
  return next;
}

export function downloadStrategySource(code: string, filename: string) {
  const url = URL.createObjectURL(new Blob([code], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename.replace(/\.[^.]+$/, "").replace(/[^\p{L}\p{N}_ -]/gu, "_") || "strategia"}.txt`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}