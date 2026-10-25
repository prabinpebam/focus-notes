// The boundary check (DSY-02, DSY-04, DSY-06): markup and styles exist only where the design
// system allows them. See documentations/design/system/overview.html#where-html-and-css-may-exist.
// Style values, style writes, and token ownership are read from the TypeScript syntax tree, not by
// pattern-matching text, so aliases, destructuring, and every style-write API are seen (D-197).
// tools/test/check-boundaries.test.mjs proves each rule against in-memory probes.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const root = join(import.meta.dirname, "..");
const SKIP = new Set(["node_modules", "dist", "dist-reader", "dist-publish", "dist-site", "dist-app", "dist-demo", "out", "release", ".git", "documentations", "slate", "test-results", ".vite"]);
const walk = (d) => (existsSync(d) ? readdirSync(d) : []).flatMap((f) => {
  if (SKIP.has(f)) return [];
  const p = join(d, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
const isTest = (f) => /\.(test|spec)\.[cm]?tsx?$/.test(f) || f.includes("/test/") || f.includes("/e2e/");

const UI = "packages/ui/src/";
const STYLED_DIRS = ["primitives/", "layouts/", "host/", "blocks/"].map((d) => UI + d);
const isStyledDir = (f) => STYLED_DIRS.some((d) => f.startsWith(d));
const TOKENS_MODULE = "@focus-notes/tokens";

// Handwritten plain CSS is not allowed anywhere: styles are vanilla-extract `.css.ts` files whose
// values the checker can read. A file may be listed here only with the reason it must be plain CSS.
// Generated token stylesheets live in packages/tokens/dist, which is not walked.
const PLAIN_CSS_ALLOWED = new Map([]);

// Unitless numbers that are counts or ratios of free space, not visual sizes: they need no token.
const UNITLESS_COUNTS = new Set(["flex", "flexGrow", "flexShrink", "order", "WebkitLineClamp", "lineClamp", "columnCount", "animationIterationCount", "gridRowStart", "gridRowEnd", "gridColumnStart", "gridColumnEnd"]);
const LENGTH_OR_DURATION = /(?<![\w#.])(\d+(?:\.\d+)?|\.\d+)(px|ms|s|rem|em|vh|vw|vmin|vmax|dvh|svh|lvh|dvw|svw|lvw|ch|ex|pt)\b/g;
const LAYOUT_GROUPS = new Set(["space", "size", "layout", "radius", "shadow", "layer", "frost", "border", "breakpoint", "motion", "easing"]);

const parse = (f, src) => ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true,
  /\.tsx$/.test(f) ? ts.ScriptKind.TSX : /\.ts$/.test(f) ? ts.ScriptKind.TS : /\.jsx$/.test(f) ? ts.ScriptKind.JSX : ts.ScriptKind.JS);
const forEachNode = (node, fn) => { fn(node); ts.forEachChild(node, (c) => forEachNode(c, fn)); };
const unwrap = (e) => {
  while (e && (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression(e) || ts.isNonNullExpression(e) || ts.isTypeAssertionExpression(e))) e = e.expression;
  return e;
};
const literalText = (e) => (e && (ts.isStringLiteralLike(e) || ts.isNumericLiteral(e)) ? e.text : undefined);
const propName = (n) => (n && (ts.isIdentifier(n) || ts.isStringLiteralLike(n) || ts.isNumericLiteral(n) || ts.isPrivateIdentifier(n)) ? n.text : undefined);

/** Style writes from outside packages/ui, in every form the DOM offers. */
function styleWrites(sf) {
  const found = [];
  const isStyle = (e) => { e = unwrap(e); return !!e && ((ts.isPropertyAccessExpression(e) && e.name.text === "style") || (ts.isElementAccessExpression(e) && literalText(e.argumentExpression) === "style")); };
  const isStyleMember = (e) => { e = unwrap(e); return !!e && (ts.isPropertyAccessExpression(e) || ts.isElementAccessExpression(e)) && isStyle(e.expression); };
  forEachNode(sf, (n) => {
    if (ts.isBinaryExpression(n) && n.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && n.operatorToken.kind <= ts.SyntaxKind.LastAssignment) {
      if (isStyle(n.left) || isStyleMember(n.left)) found.push("assigning to .style");
    } else if (ts.isCallExpression(n)) {
      const callee = unwrap(n.expression);
      if (!ts.isPropertyAccessExpression(callee)) return;
      const name = callee.name.text, target = unwrap(callee.expression), args = n.arguments;
      if ((name === "setProperty" || name === "removeProperty") && isStyle(target)) found.push(`style.${name}`);
      else if (name === "assign" && ts.isIdentifier(target) && target.text === "Object" && args.length && isStyle(args[0])) found.push("Object.assign to .style");
      else if ((name === "setAttribute" || name === "toggleAttribute") && literalText(args[0])?.toLowerCase() === "style") found.push(`${name}("style")`);
      else if (name === "setAttributeNS" && literalText(args[1])?.toLowerCase() === "style") found.push('setAttributeNS(…, "style")');
      else if (["set", "append", "delete", "clear"].includes(name) && ts.isPropertyAccessExpression(target) && target.name.text === "attributeStyleMap") found.push(`attributeStyleMap.${name}`);
    }
  });
  return found;
}

/** Raw visual values in a vanilla-extract style file: colours, lengths, durations, and bare numbers. */
function rawValues(sf) {
  const found = new Set();
  forEachNode(sf, (n) => {
    if (ts.isImportDeclaration(n.parent ?? n) && n === n.parent.moduleSpecifier) return;
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) {
      const text = n.text;
      if (/#[0-9a-fA-F]{3,8}\b/.test(text)) found.add("a hex color");
      if (/\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/.test(text)) found.add("a color function");
      for (const m of text.matchAll(LENGTH_OR_DURATION)) if (Number(m[1]) !== 0 && !(m[2] === "em" && Number(m[1]) === 1)) found.add(`a raw length or duration ("${m[0]}")`);
    } else if (ts.isPropertyAssignment(n)) {
      const v = unwrap(n.initializer);
      const num = ts.isNumericLiteral(v) ? Number(v.text) : ts.isPrefixUnaryExpression(v) && ts.isNumericLiteral(v.operand) ? (v.operator === ts.SyntaxKind.MinusToken ? -1 : 1) * Number(v.operand.text) : undefined;
      const name = propName(n.name);
      if (num !== undefined && num !== 0 && !UNITLESS_COUNTS.has(name)) found.add(`a raw number for a visual property (${name}: ${num})`);
    }
  });
  return [...found];
}

/**
 * Every read of the token tree imported from @focus-notes/tokens, whatever the binding is called:
 * named imports with aliases, namespace imports, variables, and destructuring all resolve to a path
 * such as ["cmp", "button", "text"]. A computed key that is not a literal becomes "*".
 */
function tokenReads(sf) {
  const NS = "namespace";
  const bindings = new Map(); // declaration node -> path array, or NS for a namespace import
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || literalText(st.moduleSpecifier) !== TOKENS_MODULE) continue;
    const nb = st.importClause?.namedBindings;
    if (nb && ts.isNamespaceImport(nb)) bindings.set(nb, NS);
    else if (nb) for (const el of nb.elements) if ((el.propertyName ?? el.name).text === "tokens") bindings.set(el, []);
  }
  if (!bindings.size) return [];
  const host = {
    getSourceFile: (n) => (n === sf.fileName ? sf : undefined), fileExists: (n) => n === sf.fileName, readFile: () => undefined,
    getDefaultLibFileName: () => "lib.d.ts", writeFile() {}, getCurrentDirectory: () => "/", getCanonicalFileName: (n) => n,
    useCaseSensitiveFileNames: () => true, getNewLine: () => "\n", getDirectories: () => [], directoryExists: () => false,
  };
  const checker = ts.createProgram({ rootNames: [sf.fileName], options: { noLib: true, noResolve: true, allowJs: true, types: [] }, host }).getTypeChecker();
  const child = (p, key) => (p === NS ? (key === "tokens" ? [] : null) : [...p, key]);
  const symbolOf = (id) => (ts.isShorthandPropertyAssignment(id.parent) && id.parent.name === id ? checker.getShorthandAssignmentValueSymbol(id.parent) : checker.getSymbolAtLocation(id));
  const pathOf = (e) => {
    e = unwrap(e);
    if (!e) return null;
    if (ts.isIdentifier(e)) { const d = symbolOf(e)?.declarations?.[0]; return d && bindings.has(d) ? bindings.get(d) : null; }
    if (ts.isPropertyAccessExpression(e)) { const p = pathOf(e.expression); return p === null ? null : child(p, e.name.text); }
    if (ts.isElementAccessExpression(e)) { const p = pathOf(e.expression); return p === null ? null : child(p, literalText(unwrap(e.argumentExpression)) ?? "*"); }
    return null;
  };
  const bind = (name, p) => {
    if (p === null) return false;
    if (ts.isIdentifier(name)) { const d = name.parent; if (bindings.has(d)) return false; bindings.set(d, p); return true; }
    let changed = false;
    if (ts.isObjectBindingPattern(name)) for (const el of name.elements) {
      const key = el.dotDotDotToken ? null : el.propertyName ? (ts.isComputedPropertyName(el.propertyName) ? literalText(unwrap(el.propertyName.expression)) ?? "*" : propName(el.propertyName)) : propName(el.name);
      changed = bind(el.name, key === null ? p : child(p, key)) || changed;
    }
    return changed;
  };
  const decls = [];
  forEachNode(sf, (n) => { if (ts.isVariableDeclaration(n) && n.initializer) decls.push(n); });
  for (let changed = true; changed;) { changed = false; for (const d of decls) changed = bind(d.name, pathOf(d.initializer)) || changed; }
  const isDeclName = (n) => { const p = n.parent; return (ts.isVariableDeclaration(p) || ts.isBindingElement(p) || ts.isImportSpecifier(p) || ts.isNamespaceImport(p) || ts.isImportClause(p)) && (p.name === n || p.propertyName === n); };
  const isExported = (d) => { const st = d.parent?.parent; return !!st && ts.isVariableStatement(st) && !!st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword); };
  const reads = [];
  forEachNode(sf, (n) => {
    if (!(ts.isIdentifier(n) || ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n))) return;
    if (ts.isIdentifier(n) && (isDeclName(n) || (ts.isPropertyAccessExpression(n.parent) && n.parent.name === n))) return;
    let outer = n;
    while (outer.parent && (ts.isParenthesizedExpression(outer.parent) || ts.isAsExpression(outer.parent) || ts.isNonNullExpression(outer.parent) || ts.isSatisfiesExpression(outer.parent))) outer = outer.parent;
    const parent = outer.parent;
    if (parent && (ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent)) && parent.expression === outer) return; // not the whole chain
    // A local binding of part of the tree (const t = tokens.cmp.button) is checked as far as it goes;
    // its uses complete the path. An exported binding is a read of the whole value it names.
    const binding = !!parent && ts.isVariableDeclaration(parent) && parent.initializer === outer && !isExported(parent);
    const p = pathOf(n);
    if (Array.isArray(p)) reads.push({ p, binding });
  });
  return reads;
}

const lowerFirst = (s) => s[0].toLowerCase() + s.slice(1);
const showPath = (p) => ["tokens", ...p].join(".");

/** The rules for one file, given its repository-relative path and its source. Returns error lines. */
export function checkSource(f, src) {
  const errs = [];
  if (isTest(f)) return errs;
  const isPlainCss = /\.css$/.test(f) && !f.endsWith(".css.ts");
  const isCode = /\.(tsx?|[cm]?js|jsx)$/.test(f);
  const sf = isCode ? parse(f, src) : null;
  // 1. JSX only inside packages/ui.
  if (/\.(tsx|jsx)$/.test(f) && !f.startsWith(UI)) errs.push(`${f}: JSX is only allowed in packages/ui`);
  // 2. Style files only in primitives, layouts, host, and block components, and never as plain CSS.
  if (f.endsWith(".css.ts") && !isStyledDir(f)) errs.push(`${f}: styles are only allowed in packages/ui primitives, layouts, host, and block components`);
  if (isPlainCss && !PLAIN_CSS_ALLOWED.has(f)) errs.push(`${f}: handwritten plain CSS is not allowed; write a vanilla-extract .css.ts file in a styled component folder, with token values`);
  // 3. No DOM construction, HTML injection, or style writes outside packages/ui.
  if (isCode && !f.startsWith(UI)) {
    for (const [re, what] of [[/\bcreateElement\(\s*["'`]/, "creating DOM elements"], [/\.(innerHTML|outerHTML)\s*=/, "setting innerHTML"], [/insertAdjacentHTML|document\.write\(/, "injecting HTML"]])
      if (re.test(src)) errs.push(`${f}: ${what} is only allowed in packages/ui`);
    for (const how of new Set(styleWrites(sf))) errs.push(`${f}: writing inline styles (${how}) is only allowed in packages/ui`);
  }
  // 4. Inside packages/ui: no innerHTML anywhere, and compounds never render elements or styles.
  if (f.startsWith(UI) && /\.(innerHTML|outerHTML)\s*=|dangerouslySetInnerHTML/.test(src)) errs.push(`${f}: HTML injection is never allowed`);
  if (f.startsWith(UI + "compounds/")) {
    if (/<[a-z][a-z0-9]*[\s>/]/.test(src.replace(/\/\/.*$/gm, ""))) errs.push(`${f}: compound components may not render DOM elements`);
    if (/from\s+["'][^"']*\.css["']|@vanilla-extract|style=\{/.test(src)) errs.push(`${f}: compound components may not declare styles`);
  }
  // 5. Style values are tokens only.
  if (f.endsWith(".css.ts")) for (const what of rawValues(sf)) errs.push(`${f}: contains ${what}; use a token`);
  // 5b. Token ownership: a component reads only its own component tokens; layouts read layout groups too.
  const comp = f.match(/^packages\/ui\/src\/(primitives|host|blocks|layouts)\/([A-Za-z]+)\//);
  if (comp && isCode) {
    const isLayout = comp[1] === "layouts", own = lowerFirst(comp[2]), styleFile = f.endsWith(".css.ts");
    for (const { p, binding } of tokenReads(sf)) {
      if (binding && (p.length === 0 || (p[0] === "cmp" && p.length === 1))) continue; // completed at each use
      const cmpErr = p[1] === "*" ? `reads ${showPath(p.slice(0, 2))} with a computed key the check cannot verify; read cmp.${own} by name`
        : p.length < 2 ? `reads ${showPath(p)} as a whole; read cmp.${own}` : p[1] !== own ? `reads cmp.${p[1]}; this component may read only cmp.${own}` : null;
      if (p.length === 0) errs.push(`${f}: uses the whole token tree; read cmp.${own}`);
      else if (p[0] === "cmp") { if (cmpErr) errs.push(isLayout && styleFile ? `${f}: layouts may not read ${showPath(p.slice(0, 2))}` : `${f}: ${cmpErr}`); }
      else if (!styleFile) continue; // runtime readers may read semantic values, e.g. a motion duration
      else if (p[0] === "*") errs.push(`${f}: reads the token tree with a computed key the check cannot verify`);
      else if (isLayout ? !LAYOUT_GROUPS.has(p[0]) : true) errs.push(isLayout ? `${f}: layouts may not read ${showPath(p.slice(0, 2))}` : `${f}: reads semantic token group "${p[0]}"; primitives read only their component tokens`);
    }
  }
  // 6. The renderer maps only registry components, never intrinsic elements.
  if (f.startsWith("packages/ui-runtime/src/") && /createElement\(\s*["'`]/.test(src)) errs.push(`${f}: the renderer may only create registry components`);
  // 7. Crash recovery's draft store can't write a note (QLT-06, Architecture → Crash recovery): it may
  // not import the note writer, the batch (main.ts) or Git; Git's read-only answers are handed in.
  if (f === DRAFT_STORE && sf) {
    for (const spec of moduleSpecifiers(sf)) {
      if (DRAFT_STORE_FORBIDDEN.some((re) => re.test(spec))) errs.push(`${f}: the draft store may not import "${spec}" (the note writer, the batch or Git)`);
    }
  }
  return [...new Set(errs)];
}

const DRAFT_STORE = "apps/desktop/src/main/drafts.ts";
const DRAFT_STORE_FORBIDDEN = [/(^|\/)note-write(\.ts)?$/, /(^|\/)main(\.ts)?$/, /(^|\/)git(\/|$)/, /^(node:)?child_process$/, /simple-git/, /(^|\/)workspace\/(remove|setup)/];
/** Every module a file imports or re-exports, statically, dynamically, or through require. */
function moduleSpecifiers(sf) {
  const out = [];
  const visit = (n) => {
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) out.push(n.moduleSpecifier.text);
    else if (ts.isCallExpression(n) && n.arguments[0] && ts.isStringLiteralLike(n.arguments[0]) && (n.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(n.expression) && n.expression.text === "require"))) out.push(n.arguments[0].text);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const files = [...walk(join(root, "apps")), ...walk(join(root, "packages"))].map((p) => relative(root, p).split(sep).join("/"));
  const read = (f) => readFileSync(join(root, f), "utf8");
  const errs = files.flatMap((f) => checkSource(f, /\.(tsx?|[cm]?js|jsx|html|css)$/.test(f) ? read(f) : ""));
  console.log(`Boundaries: ${files.length} files checked.`);
  if (errs.length) {
    console.error(errs.join("\n"));
    process.exit(1);
  }
  console.log("Boundary check passed.");
}