import { createServerFn } from "@tanstack/react-start";

/** Writes src/strategies/<id>/params.txt. Works only where project files are writable (preview/dev server). */
export const saveParamsFile = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string; text: string }) => {
    if (!/^[a-z0-9_-]+$/i.test(d.id)) throw new Error("Nieprawidłowa strategia");
    if (typeof d.text !== "string" || d.text.length > 20000) throw new Error("Nieprawidłowy plik");
    return d;
  })
  .handler(async ({ data }) => {
    try {
      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      const dir = path.join(process.cwd(), "src", "strategies", data.id);
      await fs.access(path.join(dir, "strategy.txt"));
      await fs.writeFile(path.join(dir, "params.txt"), data.text, "utf8");
      return { ok: true as const };
    } catch {
      return { ok: false as const };
    }
  });
