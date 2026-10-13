/** THM-02, THM-13: every built-in theme exists as tokens and passes the contrast guard. */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { BUILT_IN_THEMES, checkContrast, contrastRatio } from "../src/index.ts";

const src = join(import.meta.dirname, "..", "..", "tokens", "src");
type Tree = { [k: string]: Tree | unknown };
function flatten(obj: Tree, path: string[] = [], out = new Map<string, unknown>()) {
  if ("$value" in obj) return out.set(path.join("."), obj.$value);
  for (const [k, v] of Object.entries(obj)) if (!k.startsWith("$") && v && typeof v === "object") flatten(v as Tree, [...path, k], out);
  return out;
}
const read = (f: string) => flatten(JSON.parse(readFileSync(f, "utf8")) as Tree);
const dirFiles = (d: string) => readdirSync(join(src, d)).filter((f) => f.endsWith(".json")).map((f) => join(src, d, f));
const base = new Map<string, unknown>();
for (const f of [...dirFiles("reference"), ...dirFiles("semantic")]) for (const [k, v] of read(f)) base.set(k, v);

function resolved(themeId: string): Record<string, string> {
  const tokens = new Map(base);
  if (themeId !== "paper") for (const [k, v] of read(join(src, "themes", `${themeId}.json`))) tokens.set(k, v);
  const resolve = (v: unknown): unknown => {
    for (let i = 0; i < 10 && typeof v === "string" && /^\{.+\}$/.test(v); i++) v = tokens.get(v.slice(1, -1));
    return v;
  };
  return Object.fromEntries([...tokens.keys()].filter((k) => !k.startsWith("ref.")).map((k) => [k, String(resolve(tokens.get(k)))]));
}

describe("built-in themes", () => {
  it("every theme the app offers has tokens, and every theme file is offered", () => {
    const files = readdirSync(join(src, "themes")).map((f) => f.replace(".json", "")).sort();
    expect(BUILT_IN_THEMES.map((t) => t.id).sort()).toEqual(files);
  });
  for (const theme of BUILT_IN_THEMES) {
    it(`${theme.id} passes the contrast guard`, () => {
      const colors = resolved(theme.id);
      expect(checkContrast(colors, theme.contrast === "high")).toEqual([]);
      // Light themes have light canvases, dark themes dark ones.
      const onWhite = contrastRatio(colors["color.canvas"]!, "#ffffff");
      expect(theme.kind === "light" ? onWhite < 1.3 : onWhite > 10).toBe(true);
    });
  }
  it("measures WCAG contrast", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
    expect(Number.isNaN(contrastRatio("#00000080", "#ffffff"))).toBe(true);
  });
});
