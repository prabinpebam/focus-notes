import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { contracts } from "@focus-notes/ui/contracts";
import { isComponent, isEach, isSwitch, type ComponentNode, type Node, type ViewDocument } from "../types.ts";

/** Source-level anatomy rules run by ui:check, without rendering or a test runner. */
export function checkDesignSource(root: string): string[] {
  const problems: string[] = [];
  const read = (path: string) => readFileSync(join(root, ...path.split("/")), "utf8");
  const compact = (s: string) => s.replace(/\s/g, "");
  const source = (path: string) => ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true, path.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const requireRule = (ok: boolean, path: string, rule: string) => { if (!ok) problems.push(`${path}: ${rule}`); };
  const initializer = (file: ts.SourceFile, name: string): ts.Expression | undefined => {
    for (const statement of file.statements) if (ts.isVariableStatement(statement))
      for (const declaration of statement.declarationList.declarations)
        if (declaration.name.getText(file) === name) {
          const value = declaration.initializer;
          return value && ts.isAsExpression(value) ? value.expression : value;
        }
    return undefined;
  };
  const shared = "packages/ui/src/primitives/control.css.ts";
  const file = source(shared);
  const metrics = initializer(file, "controlMetrics");
  requireRule(Boolean(metrics && ts.isObjectLiteralExpression(metrics)), shared, "native-control metrics must remain explicit");
  if (metrics && ts.isObjectLiteralExpression(metrics)) {
    const values = new Map(metrics.properties.filter(ts.isPropertyAssignment).map((p) => [p.name.getText(file), compact(p.initializer.getText(file))]));
    for (const [key, value] of Object.entries({ appearance: '"none"', boxSizing: '"border-box"', margin: "0", paddingBlock: "0", lineHeight: "tokens.font.uiLineHeight", overflow: '"visible"' }))
      requireRule(values.get(key) === value, shared, `shared ${key} must be ${value}`);
  }
  const label = initializer(file, "controlLabel")?.getText(file) ?? "";
  requireRule(label.includes("lineHeight: tokens.font.uiLineHeight") && !/textBoxTrim|textBoxEdge/.test(label), shared, "labels must retain the complete font line box, not trim to caps or the baseline");
  requireRule(label.includes('overflowX: "clip"') && label.includes('overflowY: "visible"') && !/\boverflow\s*:/.test(label), shared, "inline ellipsis must not clip glyphs in the block direction");
  const surface = initializer(file, "floatingControlSurface")?.getText(file) ?? "";
  requireRule(surface.includes("backgroundImage: `linear-gradient(") && surface.includes("data-hovered") && surface.includes("data-pressed"), shared, "floating hover and pressed paint must be layered highlights");
  requireRule(!/opacity\s*:/.test(surface) && [...surface.matchAll(/backgroundColor:\s*([^,\n]+)/g)].every((m) => m[1] === "tokens.color.surface"), shared, "floating controls never reduce opacity or replace their solid surface with an alpha tint");
  const family: Record<string, string[]> = { Button: ["base"], PillButton: ["pill"], MenuButton: ["text", "pill"] };
  for (const [component, styles] of Object.entries(family)) {
    const path = `packages/ui/src/primitives/${component}/${component}.css.ts`;
    const css = source(path);
    for (const name of styles) {
      const value = initializer(css, name);
      const object = value && ts.isCallExpression(value) ? value.arguments[0] : undefined;
      requireRule(Boolean(object && ts.isObjectLiteralExpression(object) && object.properties.some((p) => ts.isSpreadAssignment(p) && p.expression.getText(css) === "controlMetrics")), path, `${name} must use shared native-control metrics`);
      if (object && ts.isObjectLiteralExpression(object)) requireRule(!object.properties.some((p) => ts.isPropertyAssignment(p) && ["padding", "paddingBlock", "paddingTop", "paddingBottom", "lineHeight", "height", "overflow", "overflowY", "textBoxTrim", "textBoxEdge"].includes(p.name.getText(css))), path, `${name} cannot override symmetric padding, complete line height or natural block containment`);
    }
    requireRule(initializer(css, "floating")?.getText(css) === "style(floatingControlSurface)", path, "floating controls must use shared opaque interaction paint");
    const componentSource = read(`packages/ui/src/primitives/${component}/${component}.tsx`);
    requireRule(componentSource.includes("controlLabel") && componentSource.includes("FloatingContext") && componentSource.includes("s.floating"), path, "label metrics and floating-context paint must reach the actual control");
    const ownLabel = initializer(css, "label")?.getText(css) ?? "";
    if (component === "Button") {
      requireRule(!/overflow|textBoxTrim|textBoxEdge/.test(ownLabel), path, "Button's label cannot override shared non-clipping glyph bounds");
      requireRule(!/\bheight\s*:/.test(initializer(css, "size")?.getText(css) ?? ""), path, "button sizes are token minimum heights, never a clipping fixed height");
    }
    const fixtures = contracts.find((c) => c.type === component)?.fixtures ?? [];
    requireRule(fixtures.some((f) => f.name.startsWith("glyph bounds")), path, "the gallery must show real ascenders/descenders");
    if (component === "Button") for (const variant of ["primary", "secondary", "subtle", "danger"])
      for (const size of ["s", "m", "l"]) for (const position of ["text", "start", "end"])
        requireRule(fixtures.some((f) => f.name === `glyph bounds ${variant} ${size} ${position}`), path, `missing full-glyph fixture ${variant}/${size}/${position}`);
  }
  const cardFile = source("packages/ui/src/primitives/ItemCard/ItemCard.tsx");
  const card = cardFile.getFullText();
  let disabledRadio = false;
  const visit = (node: ts.Node): void => {
    if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && node.tagName.getText(cardFile) === "input")
      disabledRadio ||= node.attributes.properties.some((p) => ts.isJsxAttribute(p) && p.name.getText(cardFile) === "disabled");
    ts.forEachChild(node, visit);
  };
  visit(cardFile);
  requireRule(!disabledRadio && card.includes("aria-disabled={busy || disabled") && card.includes("if (!inert && choiceValue)"), "ItemCard", "pending radio choices stay mounted/focusable while suppressing activation");
  const settingsText = read("packages/views/views/settings.view.json");
  const settings = JSON.parse(settingsText) as ViewDocument;
  const components = (node: Node): ComponentNode[] => {
    if (isComponent(node)) return [node, ...(node.children ?? []).flatMap(components), ...Object.values(node.slots ?? {}).flatMap((nodes) => nodes.flatMap(components))];
    if (isEach(node)) return [...components(node.render), ...(node.empty ? components(node.empty) : [])];
    if (isSwitch(node)) return Object.values(node.cases).flatMap(components);
    return [];
  };
  const nodes = components(settings.root);
  const section = nodes.find((n) => n.id === "aiConnections");
  const children = section?.children ?? [];
  const discovery = children.findIndex((n) => isComponent(n) && n.id === "aiDiscovery");
  const connections = children.findIndex((n) => isEach(n) && n.each.get === "vm.ai.connections");
  requireRule(discovery >= 0 && discovery < connections, "Settings AI", "the related discovery group must precede the connection list");
  const last = children.at(-1);
  requireRule(Boolean(last && isComponent(last) && last.id === "aiAddConnection"), "Settings AI", "Add connection must be the last section item");
  const progress = nodes.filter((n) => Object.values(n.props ?? {}).some((value) => value && typeof value === "object" && "get" in value && value.get === "vm.ai.writerSaveText"));
  requireRule(progress.length === 1 && progress[0]?.type === "LiveRegion" && !settingsText.includes('"ai.found.empty"') && !settingsText.includes('"ai.found.copilot"'), "Settings AI", "default progress must stay off-layout and not restore redundant success/empty prose");
  const group = nodes.find((n) => n.type === "Inline" && n.props?.related === true && n.props?.label && typeof n.props.label === "object" && "t" in n.props.label && n.props.label.t === "ai.found.find");
  requireRule(Boolean(group?.children?.some((n) => isComponent(n) && n.type === "Button") && group.children.some((n) => isComponent(n) && n.type === "Text")), "Settings AI", "Find and its explanation must share one named related row");
  const flatten = (node: unknown, prefix = "", out = new Map<string, unknown>()): Map<string, unknown> => {
    if (!node || typeof node !== "object") return out;
    const object = node as Record<string, unknown>;
    if ("$value" in object) out.set(prefix, object.$value);
    else for (const [key, value] of Object.entries(object)) if (!key.startsWith("$")) flatten(value, prefix ? `${prefix}.${key}` : key, out);
    return out;
  };
  const base = new Map<string, unknown>();
  for (const dir of ["reference", "semantic"]) for (const name of readdirSync(join(root, "packages", "tokens", "src", dir)).filter((n) => n.endsWith(".json")))
    for (const [key, value] of flatten(JSON.parse(read(`packages/tokens/src/${dir}/${name}`)))) base.set(key, value);
  const resolve = (values: Map<string, unknown>, key: string, seen = new Set<string>()): unknown => {
    if (seen.has(key)) throw new Error(`Cyclic token ${key}`);
    seen.add(key);
    const value = values.get(key);
    return typeof value === "string" && /^\{.+\}$/.test(value) ? resolve(values, value.slice(1, -1), seen) : value;
  };
  const number = (key: string) => Number.parseFloat(String(resolve(base, key)));
  requireRule(number("space.related") > 0 && number("space.related") < number("space.section"), "spacing tokens", "related content must be closer than independent sections");
  for (const name of ["base", ...readdirSync(join(root, "packages", "tokens", "src", "themes")).filter((n) => n.endsWith(".json"))]) {
    const values = new Map(base);
    if (name !== "base") for (const [key, value] of flatten(JSON.parse(read(`packages/tokens/src/themes/${name}`)))) values.set(key, value);
    for (const key of ["color.surface", "color.accent", "color.onAccent"]) {
      const color = String(resolve(values, key));
      requireRule(/^#[\da-f]{6}$/i.test(color) || /^#[\da-f]{6}ff$/i.test(color), name, `${key} must resolve to an opaque control/badge color`);
    }
  }
  return problems;
}
