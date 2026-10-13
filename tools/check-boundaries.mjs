// The boundary check (DSY-02, DSY-04, DSY-06): markup and styles exist only where the design
// system allows them. See documentations/design/system/overview.html#where-html-and-css-may-exist.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";

const root = join(import.meta.dirname, "..");
const SKIP = new Set(["node_modules", "dist", "out", "release", ".git", "documentations", "slate", "test-results", ".vite"]);
const walk = (d) => (existsSync(d) ? readdirSync(d) : []).flatMap((f) => {
  if (SKIP.has(f)) return [];
  const p = join(d, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
const files = [...walk(join(root, "apps")), ...walk(join(root, "packages"))].map((p) => relative(root, p).split(sep).join("/"));
const errs = [];
const read = (f) => readFileSync(join(root, f), "utf8");
const isTest = (f) => /\.(test|spec)\.[cm]?tsx?$/.test(f) || f.includes("/test/") || f.includes("/e2e/");

const UI = "packages/ui/src/";
const STYLED_DIRS = ["primitives/", "layouts/", "host/", "blocks/"].map((d) => UI + d);
const isStyledDir = (f) => STYLED_DIRS.some((d) => f.startsWith(d));

for (const f of files) {
  if (isTest(f)) continue;
  const src = /\.(tsx?|mjs|js|html|css)$/.test(f) ? read(f) : "";
  // 1. JSX only inside packages/ui.
  if (/\.(tsx|jsx)$/.test(f) && !f.startsWith(UI)) errs.push(`${f}: JSX is only allowed in packages/ui`);
  // 2. Style files only in primitives, layouts, host, and block components.
  if (/\.css(\.ts)?$/.test(f) && !isStyledDir(f) && !f.startsWith("packages/tokens/")) errs.push(`${f}: styles are only allowed in packages/ui primitives, layouts, host, and block components`);
  // 3. No DOM construction or HTML injection outside packages/ui.
  if (/\.(tsx?|mjs|js)$/.test(f) && !f.startsWith(UI)) {
    for (const [re, what] of [[/\bcreateElement\(\s*["'`]/, "creating DOM elements"], [/\.(innerHTML|outerHTML)\s*=/, "setting innerHTML"], [/insertAdjacentHTML|document\.write\(/, "injecting HTML"], [/\.style\.[a-zA-Z]+\s*=/, "inline styles"]])
      if (re.test(src)) errs.push(`${f}: ${what} is only allowed in packages/ui`);
  }
  // 4. Inside packages/ui: no innerHTML anywhere, and compounds never render elements or styles.
  if (f.startsWith(UI) && /\.(innerHTML|outerHTML)\s*=|dangerouslySetInnerHTML/.test(src)) errs.push(`${f}: HTML injection is never allowed`);
  if (f.startsWith(UI + "compounds/")) {
    if (/<[a-z][a-z0-9]*[\s>/]/.test(src.replace(/\/\/.*$/gm, ""))) errs.push(`${f}: compound components may not render DOM elements`);
    if (/from\s+["'][^"']*\.css["']|@vanilla-extract|style=\{/.test(src)) errs.push(`${f}: compound components may not declare styles`);
  }
  // 5. Style values are tokens only.
  if (f.endsWith(".css.ts")) {
    const code = src.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const [re, what] of [
      [/#[0-9a-fA-F]{3,8}\b/, "a hex color"], [/\b(rgba?|hsla?|oklch|lab)\(/, "a color function"],
      [/["'`][^"'`]*\b(?!0(px|ms|s|rem|em)\b)(?!1em\b)\d+(\.\d+)?(px|ms|rem|em|vh|vw|pt)\b/, "a raw length or duration"],
      [/\b(fontSize|lineHeight|zIndex|opacity|fontWeight|borderRadius|transitionDuration)\s*:\s*(?!0\s*[,}])\d/, "a raw number for a visual property"],
    ]) if (re.test(code)) errs.push(`${f}: contains ${what}; use a token`);
    // Primitives read only their own component tokens.
    const m = f.match(/^packages\/ui\/src\/(primitives|host|blocks)\/([A-Za-z]+)\//);
    if (m) {
      const own = m[2][0].toLowerCase() + m[2].slice(1);
      for (const t of code.matchAll(/\btokens\.([a-zA-Z]+)(?:\.([a-zA-Z]+))?/g)) {
        if (t[1] !== "cmp") errs.push(`${f}: reads semantic token group "${t[1]}"; primitives read only their component tokens`);
        else if (t[2] !== own) errs.push(`${f}: reads cmp.${t[2]}; this component may read only cmp.${own}`);
      }
    }
    const l = f.match(/^packages\/ui\/src\/layouts\/([A-Za-z]+)\//);
    if (l) {
      const own = l[1][0].toLowerCase() + l[1].slice(1);
      const LAYOUT_GROUPS = new Set(["space", "size", "layout", "radius", "shadow", "layer", "frost", "border", "breakpoint", "motion", "easing"]);
      for (const t of code.matchAll(/\btokens\.([a-zA-Z]+)(?:\.([a-zA-Z]+))?/g)) {
        if (t[1] === "cmp" ? t[2] !== own : !LAYOUT_GROUPS.has(t[1])) errs.push(`${f}: layouts may not read tokens.${t[1]}${t[2] ? "." + t[2] : ""}`);
      }
    }
  }
  // 6. The renderer maps only registry components, never intrinsic elements.
  if (f.startsWith("packages/ui-runtime/src/") && /createElement\(\s*["'`]/.test(src)) errs.push(`${f}: the renderer may only create registry components`);
}
console.log(`Boundaries: ${files.length} files checked.`);
if (errs.length) {
  console.error(errs.join("\n"));
  process.exit(1);
}
console.log("Boundary check passed.");
