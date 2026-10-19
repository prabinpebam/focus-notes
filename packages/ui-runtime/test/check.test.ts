import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { contracts, ICON_NAMES, type Contract } from "@focus-notes/ui/contracts";
import { createApp, type JsonSchema, type PlatformBridge } from "@focus-notes/core";
import { views, messages } from "@focus-notes/views";
import { tokenGroups } from "@focus-notes/tokens";
import { checkUi, checkFixtureCoverage, type Problem } from "../src/check.ts";
import { checkExpression, evaluate } from "../src/expr.ts";
import { VIEW_SCHEMA_URL } from "../src/migrate.ts";

const bridge: PlatformBridge = {
  platform: "windows", readNote: async () => "", writeNote: async () => {}, chooseNote: async () => undefined, newNotePath: async () => "/notes/Untitled.md",
  defaultNotePath: async () => "", loadAppState: async () => ({ version: 1 }), saveAppState: async () => {},
  systemScheme: () => "light", onSystemSchemeChange: () => () => {},
};
const app = createApp(bridge, messages.en!);
const base = {
  contracts, icons: ICON_NAMES, tokenGroups: tokenGroups as unknown as Record<string, readonly string[]>, fragments: {},
  commands: new Set(app.commands.ids()),
  viewModels: new Map(app.viewModels.list().map((v) => [v.id, { schema: v.schema, ...(v.setters ? { setters: v.setters } : {}) }])),
  messages: app.messages,
};
const view = (root: unknown, extra: Record<string, unknown> = {}) => ({
  t: { $schema: VIEW_SCHEMA_URL, id: "t", viewModels: ["vm.app", "vm.canvas"], focus: "f", root: { type: "AppRoot", props: { scheme: "light", platform: "windows" }, children: [{ type: "Stack", id: "f", children: [root] }] }, ...extra },
});
const problems = (root: unknown, extra?: Record<string, unknown>): Problem[] => checkUi({ ...base, views: view(root, extra) });
const messagesOf = (ps: Problem[]) => ps.map((p) => `${p.stage}: ${p.message}`);
const repo = join(import.meta.dirname, "..", "..", "..");
const exists = (p: string) => existsSync(join(repo, p));

describe("ui:check (DSY-08)", () => {
  it("passes the real views", () => expect(checkUi({ ...base, views })).toEqual([]));
  it("passes a valid node", () => expect(problems({ type: "Text", props: { value: { t: "gallery.sample" } } })).toEqual([]));
  it("rejects unknown components", () => expect(problems({ type: "Div" }).length).toBeGreaterThan(0));
  // DSY-05: closed contracts, with no className, style, or attribute pass-through.
  it("rejects undeclared props such as className and style", () => {
    expect(problems({ type: "Text", props: { value: { t: "gallery.sample" }, className: "x" } }).length).toBeGreaterThan(0);
    expect(problems({ type: "Text", props: { value: { t: "gallery.sample" }, style: { color: "red" } } }).length).toBeGreaterThan(0);
  });
  // I18N-01: interface text is a message key, never a literal.
  it("rejects literal text", () => expect(messagesOf(problems({ type: "Text", props: { value: "Hello" } })).join()).toMatch(/schema|literal/));
  // DSY-02: a raw value where a token is expected fails the check.
  it("rejects raw values where a token is expected", () => expect(problems({ type: "Stack", props: { gap: "12px" } }).length).toBeGreaterThan(0));
  it("rejects unknown messages and wrong arguments", () => {
    expect(messagesOf(problems({ type: "Text", props: { value: { t: "nope.missing" } } }))).toContain('references: message "nope.missing" doesn\'t exist');
    expect(messagesOf(problems({ type: "Text", props: { value: { t: "canvas.placeholder" } } }))).toContain('types: message "canvas.placeholder" needs argument "platform"');
  });
  it("rejects reads that don't exist or have the wrong type", () => {
    expect(messagesOf(problems({ type: "Text", props: { value: { get: "vm.canvas.nothing" } } }))).toContain('references: "vm.canvas.nothing" doesn\'t exist');
    expect(messagesOf(problems({ type: "Stack", props: { grow: { get: "vm.canvas.noteKey" } } }))).toContain('types: "vm.canvas.noteKey" is string, but this prop needs boolean');
  });
  // DSY-07: view documents hold only registry references, message keys, typed reads, known commands, and a restricted expression subset.
  it("rejects unknown commands", () => {
    expect(messagesOf(problems({ type: "Button", props: { label: { t: "gallery.action" } }, on: { press: { run: "nope.go" } } }))).toContain("references: unknown command nope.go");
  });
  it("requires a disabled button to say why", () => {
    expect(messagesOf(problems({ type: "Button", props: { label: { t: "gallery.action" }, disabled: true } }))).toContain("accessibility: disabledReason is required when disabled is set");
  });
  it("requires a focus target and unique ids", () => {
    expect(messagesOf(checkUi({ ...base, views: { t: { ...view({ type: "Text", props: { value: { t: "gallery.sample" } } }).t, focus: undefined } } }))).toContain("accessibility: every view says where focus goes when it opens");
    expect(messagesOf(problems({ type: "Text", id: "f", props: { value: { t: "gallery.sample" } } }))).toContain('references: duplicate id "f"');
  });
  it("lets an overlay view add only dialogs and side sheets beside the main view (Settings, the theme manager)", () => {
    const dialog = { type: "Dialog", id: "f", props: { title: { t: "gallery.sample" }, closeLabel: { t: "dialog.close" } }, children: [{ type: "Text", props: { value: { t: "gallery.sample" } } }] };
    const overlay = (children: unknown[]) => ({ o: { $schema: VIEW_SCHEMA_URL, id: "o", overlay: true, viewModels: [], focus: "f", root: { type: "Stack", children } } });
    expect(checkUi({ ...base, views: overlay([dialog]) })).toEqual([]);
    const sheet = { type: "Sheet", id: "s", props: { label: { t: "gallery.sample" }, side: "end", width: "theme" }, children: [{ type: "Text", props: { value: { t: "gallery.sample" } } }] };
    expect(checkUi({ ...base, views: overlay([dialog, sheet]) })).toEqual([]);
    expect(messagesOf(checkUi({ ...base, views: overlay([dialog, { type: "Text", props: { value: { t: "gallery.sample" } } }]) }))).toContain("design: an overlay view's root is a Stack of Dialogs and Sheets");
    expect(messagesOf(checkUi({ ...base, views: { o: { ...overlay([dialog]).o, overlay: undefined } } }))).toContain("design: a view's root is AppRoot");
  });
  it("limits expressions", () => {
    expect(messagesOf(problems({ type: "Text", when: { expr: { "+": [1, 2] } }, props: { value: { t: "gallery.sample" } } }))).toContain('design: operator "+" is not allowed in views');
  });
  it("rejects children a component doesn't accept", () => {
    expect(messagesOf(problems({ type: "Tooltip", props: { label: { t: "gallery.sample" } }, children: [{ type: "Text", props: { value: { t: "gallery.sample" } } }] }))).toContain("design: Tooltip doesn't accept Text as a child");
  });
  it("covers every enum value with a fixture (DSY-09)", () => expect(checkFixtureCoverage(contracts, { exists })).toEqual([]));
});

// DS-A02, D-198: every declared state is rendered by a fixture, reached by a journey that exists, or a reasoned gap.
describe("declared-state coverage (DS-A02)", () => {
  const edit = (type: string, change: (c: Contract) => Contract) => contracts.map((c) => (c.type === type ? change(structuredClone(c) as Contract) : c));
  const gaps = (cs: readonly Contract[]) => checkFixtureCoverage(cs, { exists });
  it("fails a new state nothing covers", () => {
    expect(gaps(edit("Button", (c) => ({ ...c, states: [...c.states, "glowing"] })))).toContain('Button: state "glowing" has no fixture or journey, and no reason it\'s uncovered');
  });
  it("fails when the only fixture for busy stops covering it", () => {
    const out = gaps(edit("Button", (c) => ({ ...c, fixtures: c.fixtures.map((f) => ({ ...f, covers: f.covers?.filter((s) => s !== "busy") })) })));
    expect(out).toContain('Button: state "busy" has no fixture or journey, and no reason it\'s uncovered');
  });
  it("fails when the only journey for focusVisible is removed", () => {
    expect(gaps(edit("IconButton", (c) => ({ ...c, journeys: [] })))).toContain('IconButton: state "focusVisible" has no fixture or journey, and no reason it\'s uncovered');
  });
  it("fails a host without its journeys, or naming one that doesn't exist", () => {
    expect(gaps(edit("EditorSurface", (c) => ({ ...c, journeys: undefined })))).toContain("EditorSurface: a host names the journeys that exercise it");
    expect(gaps(edit("EditorSurface", (c) => ({ ...c, journeys: [{ spec: "apps/desktop/e2e/nope.spec.ts", covers: ["editing"] }, ...(c.journeys ?? [])] })))).toContain("EditorSurface: journey apps/desktop/e2e/nope.spec.ts doesn't exist");
  });
  it("fails state names a contract doesn't declare, and exceptions that hide real coverage", () => {
    expect(gaps(edit("Button", (c) => ({ ...c, fixtures: [...c.fixtures, { name: "x", covers: ["glowing"] }] })))).toContain('Button: fixture "x" covers "glowing", which isn\'t a declared state');
    expect(gaps(edit("Button", (c) => ({ ...c, uncovered: { ...c.uncovered, busy: "no reason" } })))).toContain('Button: "busy" is listed as uncovered, but a fixture or journey covers it');
    expect(gaps(edit("Button", (c) => ({ ...c, uncovered: { ...c.uncovered, hover: " " } })))).toContain('Button: uncovered "hover" needs a reason');
  });
});

// DS-A04, D-198: a list prop's read must hold the items its kind needs, not just any array.
describe("list item contracts (DS-A04)", () => {
  const ITEM = { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, icon: { type: "string" }, disabled: { type: "boolean" } } };
  const probe = { type: "object", properties: {
    words: { type: "array", items: { type: "string" } },
    actions: { type: "array", items: ITEM },
    sections: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, items: { type: "array", items: ITEM } } } },
    unlabelled: { type: "array", items: { type: "object", properties: { id: { type: "string" } } } },
    badIds: { type: "array", items: { type: "object", properties: { id: { type: "number" }, label: { type: "string" } } } },
    flatSections: { type: "array", items: { type: "object", properties: { id: { type: "string" }, items: { type: "array", items: { type: "string" } } } } },
  } } as const;
  const toolbar = (items: string, more: string) => ({ type: "Toolbar", props: { label: { t: "toolbar.label" }, items: { get: items }, more: { get: more }, moreLabel: { t: "toolbar.more" } } });
  const check = (items: string, more: string) => messagesOf(checkUi({
    ...base, viewModels: new Map<string, { schema: JsonSchema; setters?: Record<string, string> }>([...base.viewModels, ["vm.probe", { schema: probe as unknown as JsonSchema }]]),
    views: { t: { ...view(toolbar(items, more)).t, viewModels: ["vm.app", "vm.canvas", "vm.probe"] } },
  }));
  it("passes command items and menu sections", () => expect(check("vm.probe.actions", "vm.probe.sections")).toEqual([]));
  it("rejects a string[] bound to Toolbar's lists, naming the field", () => {
    const out = check("vm.probe.words", "vm.probe.words");
    expect(out).toContain('types: "vm.probe.words" holds string items, but commandItems needs objects');
    expect(out).toContain('types: "vm.probe.words" holds string items, but menuSections needs objects');
  });
  it("rejects items without a required field, or with the wrong type", () => {
    expect(check("vm.probe.unlabelled", "vm.probe.sections")).toContain('types: "vm.probe.unlabelled" items have no "label", which commandItems needs');
    expect(check("vm.probe.badIds", "vm.probe.sections")).toContain('types: "vm.probe.badIds" items\' "id" is number, but commandItems needs string');
  });
  it("checks nested menu items", () => {
    expect(check("vm.probe.actions", "vm.probe.flatSections")).toContain('types: "vm.probe.flatSections" items\' "items" holds string items, but commandItems needs objects');
    expect(check("vm.probe.actions", "vm.probe.actions")).toContain('types: "vm.probe.actions" items have no "items", which menuSections needs');
  });
});

describe("expressions (D-60)", () => {
  it("evaluates the allowed subset", () => {
    const read = (p: string) => ({ a: 1, b: "x", c: true } as Record<string, unknown>)[p];
    expect(evaluate({ and: [{ "==": [{ get: "a" }, 1] }, { get: "c" }] }, read)).toBe(true);
    expect(evaluate({ if: [{ "!": { get: "c" } }, "no", "yes"] }, read)).toBe("yes");
    expect(evaluate({ in: [{ get: "b" }, ["x", "y"]] }, read)).toBe(true);
  });
  it("rejects disallowed operators and deep nesting", () => {
    expect(checkExpression({ map: [] })).toContain('operator "map" is not allowed in views');
    expect(checkExpression({ "!": { "!": { "!": { "!": { "!": true } } } } }).join()).toMatch(/deeper/);
  });
});
