// The design system's styles as CSS, one block per `.css.ts` file, with debug class names
// (`Button_base__x1y2`), so the spacing linter can read them like any stylesheet (the spacing skill).
import { createRequire } from "node:module";
import { readdirSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const STYLE_DIRS = [join(root, "packages", "ui", "src")];

function* cssTs(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* cssTs(p);
    else if (e.name.endsWith(".css.ts")) yield p;
  }
}

/** Every `.css.ts` file in the design system, compiled: `[{ file, css }]` with paths relative to the root. */
export async function compileStyles() {
  const fromDesktop = createRequire(join(root, "apps", "desktop", "package.json"));
  const fromPlugin = createRequire(fromDesktop.resolve("@vanilla-extract/vite-plugin"));
  const { createCompiler } = fromPlugin("@vanilla-extract/compiler");
  /** @type {Map<string, string>} */
  const byFile = new Map();
  const compiler = createCompiler({
    root,
    identifiers: "debug",
    enableFileWatcher: false,
    cssImportSpecifier: (filePath, css) => {
      byFile.set(filePath, css);
      return `${filePath}.vanilla.css`;
    },
  });
  try {
    for (const dir of STYLE_DIRS) for (const file of cssTs(dir)) await compiler.processVanillaFile(file, { outputCss: true });
  } finally {
    await compiler.close();
  }
  return [...byFile].map(([file, css]) => ({ file: relative(root, file).replaceAll("\\", "/"), css })).sort((a, b) => a.file.localeCompare(b.file));
}
