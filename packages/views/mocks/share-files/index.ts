/**
 * Shared and published files (owner, 26 November; D-431): the app's own Files panel and Share details…
 * documents over fake data. Each shared or published file carries an icon at its row's end, in Opened
 * files, Pinned, Recent and the tree; a shared file's menu has Share details…, which opens its own
 * dialog of the shares Settings → Sharing used to list. Spec: documentations/design/views/files.html.
 */
import canvas from "../../views/canvas.view.json" with { type: "json" };
import shareItem from "../../views/shareItem.view.json" with { type: "json" };
import data from "../opened-files/data.json" with { type: "json" };
import { compose } from "../../src/compose.ts";

type Entry = { id: string; label: string; view: string; local?: Record<string, string | number | boolean> };
type Node = Record<string, unknown>;
type Item = { id: string } & Record<string, unknown>;

const find = (node: unknown, test: (n: Node) => boolean): Node | undefined => {
  if (!node || typeof node !== "object") return undefined;
  const n = node as Node;
  if (test(n)) return n;
  for (const v of Object.values(n)) { const found = find(v, test); if (found) return found; }
  return undefined;
};

const MODELS = /^vm\.(files|project|deleted|recovered|opened|syncAlert|shareDetails)\b/;
const mockOf = (node: unknown, model: string): unknown => {
  if (Array.isArray(node)) return node.map((n) => mockOf(n, model));
  if (!node || typeof node !== "object") return typeof node === "string" ? node.replace(MODELS, `vm.${model}.$1`) : node;
  return Object.fromEntries(Object.entries(node).filter(([k]) => k !== "on").map(([k, v]) => [k === "bind" ? "get" : k, mockOf(v, model)]));
};

const sheet = find(compose(canvas), (n) => n.type === "Sheet" && n.id === "files")!;
const keep = (sheet.children as Node[]).filter((c) => c.id === "filesShortcuts" || c.id === "filesTree").map(({ slots: _slots, ...c }) => {
  const { cardLabel: _cardLabel, ...props } = (c.props ?? {}) as Node;
  const { card: _card, ...on } = (c.on ?? {}) as Node;
  return { ...c, props, ...(c.on ? { on } : {}) };
});
const opened: Node = {
  type: "OpenedFiles", id: "filesOpened",
  props: { label: { t: "files.opened.heading" }, items: { get: "vm.opened.items" }, menu: { get: "vm.opened.menu" }, menuLabel: { t: "files.opened.menu" }, closeLabel: { t: "files.opened.close" } },
};
// The row's right-click menu, drawn as the app's command menu beside Spec ideas.
const rowMenu: Node = { type: "TextMenu", props: { label: { t: "files.tree" }, sections: { get: "vm.files.rowMenu" }, open: true, x: 220, y: 330 } };
const { when: _when, ...sheetNode } = sheet;
const panel = (extra: Node[] = []): Node => ({ ...sheetNode, slots: { band: (sheet.slots as Node).band, header: (sheet.slots as Node).header }, children: [opened, ...keep, ...extra] });
const dialog = find(compose(shareItem), (n) => n.type === "Dialog" && n.id === "shareDetailsDialog")!;
const view = (model: string, root: Node, id: string) => ({ id: `gallery.mock.${id}`, focus: "files", root: mockOf(root, model) as Node });

const SHARED = { shared: true, siteLabel: "Shared" };
const PUBLISHED = { published: true, siteLabel: "Published" };
const BOTH = { shared: true, published: true, siteLabel: "Shared and published" };
const marks: Record<string, Record<string, unknown>> = {
  "spec-ideas.md": SHARED, "reading-list.md": BOTH, "journal/weekly-review.md": PUBLISHED, "ideas/naming.md": SHARED, "roadmap.md": PUBLISHED,
};
const marked = (i: Item) => ({ ...i, ...(marks[i.id] ?? {}) });
const section = (id: string, label: string, entries: Item[]) => [{ id: `root:${id}`, kind: "section", level: 1, label, expanded: true, hasChildren: entries.length > 0 }, ...entries];
const open = data.opened.few as Item[];
const ids = new Set(open.map((o) => o.id));
const rowMenuItems = [
  { id: "m0", items: [{ id: "files.openItem", label: "Open", shortcut: "" }, { id: "files.pinItem", label: "Unpin", shortcut: "" }] },
  { id: "m1", items: [{ id: "files.share", label: "Share…", shortcut: "" }, { id: "files.shareDetails", label: "Share details…", shortcut: "" }] },
  { id: "m2", items: [{ id: "files.publish", label: "Publish…", shortcut: "" }] },
  { id: "m3", items: [{ id: "files.reveal", label: "Show in File Explorer", shortcut: "" }, { id: "files.copyPath", label: "Copy as path", shortcut: "" }, { id: "files.copyText", label: "Copy text", shortcut: "" }] },
  { id: "m4", items: [{ id: "files.rename", label: "Rename file…", shortcut: "F2" }, { id: "files.duplicate", label: "Duplicate", shortcut: "" }, { id: "files.move", label: "Move to…", shortcut: "" }] },
  { id: "m5", items: [{ id: "files.delete", label: "Delete", shortcut: "Delete" }] },
];
const files = {
  ...data.files,
  shortcuts: [...section("pinned", "Pinned", (data.pinned as Item[]).map(marked)), ...section("recent", "Recent", (data.recent as Item[]).filter((r) => !ids.has(r.id)).map(marked))],
  items: (data.files.items as Item[]).map((i) => ({ ...marked(i), current: i.id === "spec-ideas.md" })),
  rowMenu: rowMenuItems,
};
const EXTEND = [{ id: "actions", items: [{ id: "7d", label: "7 days" }, { id: "30d", label: "30 days" }, { id: "90d", label: "90 days" }, { id: "never", label: "Always" }] }];
const shareDetails = {
  open: true, name: "Spec ideas", busy: false, status: "", hasStatus: false, problem: "", hasProblem: false, copyLabel: "Copy", extendLabel: "Extend", againLabel: "Share again…",
  rows: [
    { id: "g1", methods: "Link and passcode", detail: "expires 26 Dec", badge: "Active", newer: "", hasNewer: false,
      copyMenu: [{ id: "actions", items: [{ id: "link", label: "Copy link" }, { id: "accessCode", label: "Copy access code" }, { id: "information", label: "Copy share information" }] }], extendMenu: EXTEND },
    { id: "g2", methods: "Link", detail: "expires 29 Nov", badge: "Expires soon", newer: "", hasNewer: false,
      copyMenu: [{ id: "actions", items: [{ id: "link", label: "Copy link" }, { id: "information", label: "Copy share information" }] }], extendMenu: EXTEND },
  ],
};
const syncAlert = {
  active: false, headerAlert: false, cause: "", icon: "warning", tone: "warning", busy: false,
  title: "", line: "", progress: 0, progressLabel: "", hasProgress: false,
  facts: [{ id: "a", text: "" }], primary: "", hasPrimary: false, secondary: "", hasSecondary: false,
  notNow: "", hasNotNow: false, alertLabel: "", cornerState: "error", cornerText: "", cornerOpen: false, headerOpen: false,
};
const model = (patch: Record<string, unknown> = {}) => ({ ...data, files, opened: { items: open.map(marked), menu: data.opened.menu }, syncAlert, shareDetails, ...patch });

export const shareFilesMocks = {
  id: "shareFiles",
  label: "Mocks: Shared and published files (26 November, D-431)",
  models: {
    sfPanel: model(),
    sfCopied: model({ shareDetails: { ...shareDetails, status: "Copied.", hasStatus: true } }),
  },
  views: {
    panel: view("sfPanel", panel(), "shareFiles.panelDoc"),
    menu: view("sfPanel", panel([rowMenu]), "shareFiles.menuDoc"),
    details: view("sfPanel", { type: "Stack", children: [panel(), dialog] }, "shareFiles.detailsDoc"),
    copied: view("sfCopied", { type: "Stack", children: [panel(), dialog] }, "shareFiles.copiedDoc"),
  },
  entries: [
    { id: "shareFiles.panel", label: "1. Marks: shared, published, both, in Opened files, Pinned, Recent and the tree (hover a mark for its name)", view: "panel" },
    { id: "shareFiles.menu", label: "2. A shared file's menu: Share details… under Share…", view: "menu" },
    { id: "shareFiles.details", label: "3. Share details…: the file's shares, Copy, Extend, Withdraw", view: "details" },
    { id: "shareFiles.copied", label: "4. After Copy: Copied.", view: "copied" },
  ] as Entry[],
};
