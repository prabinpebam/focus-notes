/**
 * D-111: a popover never goes past the window. React Aria measures a popover's whole box and sets
 * its maximum height to the room it has, so every popover's box must hold its padding and border
 * inside that height (`box-sizing: border-box`); otherwise a menu taller than the room overflows
 * the window by its padding and border. Checks every `<Popover className={x.y}>` in packages/ui.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const SRC = join(import.meta.dirname, "..", "src");
const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? files(join(dir, d.name)) : d.name.endsWith(".tsx") ? [join(dir, d.name)] : []));

/** The text of `export const <name> = style({ … })` in a stylesheet, up to its closing `});`. */
function styleBlock(css: string, name: string): string | undefined {
  const i = css.indexOf(`export const ${name} = style(`);
  if (i < 0) return undefined;
  const end = css.indexOf("});", i);
  return css.slice(i, end < 0 ? undefined : end);
}

describe("popovers hold their padding inside React Aria's maximum height", () => {
  const found: { file: string; cls: string; ok: boolean }[] = [];
  for (const file of files(SRC)) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/<Popover\b[^>]*?className=\{(\w+)\.(\w+)\}/gs)) {
      const [, alias, name] = m;
      const imp = new RegExp(`import \\* as ${alias} from "([^"]+)"`).exec(text);
      if (!imp) continue;
      const css = readFileSync(resolve(dirname(file), imp[1]!), "utf8");
      const block = styleBlock(css, name!) ?? "";
      found.push({ file: file.slice(SRC.length + 1), cls: `${alias}.${name}`, ok: /boxSizing:\s*"border-box"/.test(block) });
    }
  }
  it("finds the popovers", () => expect(found.length).toBeGreaterThanOrEqual(5));
  it("each is border-box", () => expect(found.filter((f) => !f.ok)).toEqual([]));
});
