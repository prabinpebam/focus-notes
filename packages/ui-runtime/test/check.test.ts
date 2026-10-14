import { describe, expect, it } from "vitest";
import { contracts, ICON_NAMES } from "@focus-notes/ui/contracts";
import { createApp, type PlatformBridge } from "@focus-notes/core";
import { views, messages } from "@focus-notes/views";
import { tokenGroups } from "@focus-notes/tokens";
import { checkUi, checkFixtureCoverage, type Problem } from "../src/check.ts";
import { checkExpression, evaluate } from "../src/expr.ts";

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
  t: { $schema: "x", id: "t", viewModels: ["vm.app", "vm.canvas"], focus: "f", root: { type: "AppRoot", props: { scheme: "light", platform: "windows" }, children: [{ type: "Stack", id: "f", children: [root] }] }, ...extra },
});
const problems = (root: unknown, extra?: Record<string, unknown>): Problem[] => checkUi({ ...base, views: view(root, extra) });
const messagesOf = (ps: Problem[]) => ps.map((p) => `${p.stage}: ${p.message}`);

describe("ui:check (DSY-08)", () => {
  it("passes the real views", () => expect(checkUi({ ...base, views })).toEqual([]));
  it("passes a valid node", () => expect(problems({ type: "Text", props: { value: { t: "gallery.sample" } } })).toEqual([]));
  it("rejects unknown components", () => expect(problems({ type: "Div" }).length).toBeGreaterThan(0));
  it("rejects undeclared props such as className and style", () => {
    expect(problems({ type: "Text", props: { value: { t: "gallery.sample" }, className: "x" } }).length).toBeGreaterThan(0);
    expect(problems({ type: "Text", props: { value: { t: "gallery.sample" }, style: { color: "red" } } }).length).toBeGreaterThan(0);
  });
  it("rejects literal text", () => expect(messagesOf(problems({ type: "Text", props: { value: "Hello" } })).join()).toMatch(/schema|literal/));
  it("rejects raw values where a token is expected", () => expect(problems({ type: "Stack", props: { gap: "12px" } }).length).toBeGreaterThan(0));
  it("rejects unknown messages and wrong arguments", () => {
    expect(messagesOf(problems({ type: "Text", props: { value: { t: "nope.missing" } } }))).toContain('references: message "nope.missing" doesn\'t exist');
    expect(messagesOf(problems({ type: "Text", props: { value: { t: "canvas.placeholder" } } }))).toContain('types: message "canvas.placeholder" needs argument "platform"');
  });
  it("rejects reads that don't exist or have the wrong type", () => {
    expect(messagesOf(problems({ type: "Text", props: { value: { get: "vm.canvas.nothing" } } }))).toContain('references: "vm.canvas.nothing" doesn\'t exist');
    expect(messagesOf(problems({ type: "Stack", props: { grow: { get: "vm.canvas.noteKey" } } }))).toContain('types: "vm.canvas.noteKey" is string, but this prop needs boolean');
  });
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
  it("lets an overlay view add only dialogs beside the main view (Settings)", () => {
    const dialog = { type: "Dialog", id: "f", props: { title: { t: "gallery.sample" }, closeLabel: { t: "dialog.close" } }, children: [{ type: "Text", props: { value: { t: "gallery.sample" } } }] };
    const overlay = (children: unknown[]) => ({ o: { $schema: "x", id: "o", overlay: true, viewModels: [], focus: "f", root: { type: "Stack", children } } });
    expect(checkUi({ ...base, views: overlay([dialog]) })).toEqual([]);
    expect(messagesOf(checkUi({ ...base, views: overlay([dialog, { type: "Text", props: { value: { t: "gallery.sample" } } }]) }))).toContain("design: an overlay view's root is a Stack of Dialogs");
    expect(messagesOf(checkUi({ ...base, views: { o: { ...overlay([dialog]).o, overlay: undefined } } }))).toContain("design: a view's root is AppRoot");
  });
  it("limits expressions", () => {
    expect(messagesOf(problems({ type: "Text", when: { expr: { "+": [1, 2] } }, props: { value: { t: "gallery.sample" } } }))).toContain('design: operator "+" is not allowed in views');
  });
  it("rejects children a component doesn't accept", () => {
    expect(messagesOf(problems({ type: "Tooltip", props: { label: { t: "gallery.sample" } }, children: [{ type: "Text", props: { value: { t: "gallery.sample" } } }] }))).toContain("design: Tooltip doesn't accept Text as a child");
  });
  it("covers every enum value with a fixture (DSY-09)", () => expect(checkFixtureCoverage(contracts)).toEqual([]));
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
