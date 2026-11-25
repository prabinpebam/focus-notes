/**
 * Opened files (owner, 23 November; D-410, FIL-20): the app's own Files panel document over fake data,
 * with the Opened files section above Pinned. Strict design: nothing is wired. Spec:
 * documentations/design/views/files.html#opened-files.
 *
 * "Before" is today's panel: Recent lists the notes that are open. "After" adds the section and leaves
 * the open notes out of Recent. Hover, keyboard focus and the open ⋯ menu are interaction states,
 * reached on the "After" entry.
 */
import canvas from "../../views/canvas.view.json" with { type: "json" };
import data from "./data.json" with { type: "json" };
import { compose } from "../../src/compose.ts";

type Entry = { id: string; label: string; view: string; local?: Record<string, string | number | boolean> };
type Node = Record<string, unknown>;
type Item = { id: string } & Record<string, unknown>;

const findSheet = (node: unknown): Node | undefined => {
  if (!node || typeof node !== "object") return undefined;
  const n = node as Node;
  if (n.type === "Sheet" && n.id === "files") return n;
  for (const v of Object.values(n)) { const found = findSheet(v); if (found) return found; }
  return undefined;
};

const MODELS = /^vm\.(files|project|deleted|recovered|opened|syncAlert)\b/;
const mockOf = (node: unknown, model: string): unknown => {
  if (Array.isArray(node)) return node.map((n) => mockOf(n, model));
  if (!node || typeof node !== "object") return typeof node === "string" ? node.replace(MODELS, `vm.${model}.$1`) : node;
  return Object.fromEntries(Object.entries(node).filter(([k]) => k !== "on").map(([k, v]) => [k === "bind" ? "get" : k, mockOf(v, model)]));
};

const sheet = findSheet(compose(canvas))!;
const keep = (sheet.children as Node[]).filter((c) => c.id === "filesShortcuts" || c.id === "filesTree").map(({ slots: _slots, ...c }) => {
  // The deleting card (D-428) went with the slots; its label goes too.
  const { cardLabel: _cardLabel, ...props } = (c.props ?? {}) as Node;
  const { card: _card, ...on } = (c.on ?? {}) as Node;
  return { ...c, props, ...(c.on ? { on } : {}) };
});
const opened: Node = {
  type: "OpenedFiles", id: "filesOpened", when: { get: "vm.deleted.closed" },
  props: { label: { t: "files.opened.heading" }, items: { get: "vm.opened.items" }, menu: { get: "vm.opened.menu" }, menuLabel: { t: "files.opened.menu" }, closeLabel: { t: "files.opened.close" } },
};
const { when: _when, ...sheetNode } = sheet;
const panel = (withOpened: boolean): Node => ({ ...sheetNode, slots: { band: (sheet.slots as Node).band, header: (sheet.slots as Node).header }, children: withOpened ? [opened, ...keep] : keep });
const view = (model: string, withOpened: boolean, id: string) => ({ id: `gallery.mock.${id}`, focus: "files", root: mockOf(panel(withOpened), model) as Node });

const section = (id: string, label: string, entries: Item[]) => [{ id: `root:${id}`, kind: "section", level: 1, label, expanded: true, hasChildren: entries.length > 0 }, ...entries];
const modelFor = (open: Item[]) => {
  const ids = new Set(open.map((o) => o.id));
  const current = open.find((o) => o.current)?.id;
  // Opened files aren't in Recent (the owner); before, every visited note is.
  const recent = data.recent.filter((r) => !ids.has(r.id));
  return {
    ...data,
    files: {
      ...data.files,
      shortcuts: [...section("pinned", "Pinned", data.pinned), ...section("recent", "Recent", recent)],
      items: data.files.items.map((i) => ({ ...i, current: i.id === current })),
    },
    opened: { items: open, menu: data.opened.menu },
    syncAlert: {
      active: false, headerAlert: false, cause: "", icon: "warning", tone: "warning", busy: false,
      title: "", line: "", progress: 0, progressLabel: "", hasProgress: false,
      facts: [{ id: "a", text: "" }], primary: "", hasPrimary: false, secondary: "", hasSecondary: false,
      notNow: "", hasNotNow: false, alertLabel: "", cornerState: "error", cornerText: "", cornerOpen: false, headerOpen: false,
    },
  };
};
const before = { ...modelFor([]), files: { ...modelFor([]).files, shortcuts: [...section("pinned", "Pinned", data.pinned), ...section("recent", "Recent", data.recent)], items: data.files.items } };

export const openedFilesMocks = {
  id: "openedFiles",
  label: "Mocks: Opened files (23 November, D-410)",
  models: { ofBefore: before, ofAfter: modelFor(data.opened.few), ofMany: modelFor(data.opened.many), ofNone: modelFor(data.opened.none) },
  views: {
    before: view("ofBefore", false, "openedFiles.beforeDoc"),
    after: view("ofAfter", true, "openedFiles.afterDoc"),
    many: view("ofMany", true, "openedFiles.manyDoc"),
    // With nothing open the component renders nothing (its "nothing open" fixture); an empty list has no item schema to check here.
    none: view("ofNone", false, "openedFiles.noneDoc"),
  },
  entries: [
    { id: "openedFiles.before", label: "0. Before: today's Files panel (open notes listed in Recent)", view: "before" },
    { id: "openedFiles.after", label: "1. Opened files above Pinned, the active one; Recent without them (hover, focus and ⋯ here)", view: "after" },
    { id: "openedFiles.many", label: "2. Many open, a long name truncated", view: "many" },
    { id: "openedFiles.none", label: "3. Nothing open: no section", view: "none" },
  ] as Entry[],
};
