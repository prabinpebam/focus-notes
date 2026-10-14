/**
 * The gallery (DSY-09): every component fixture as its own view document, rendered through the
 * same runtime as the app. Each fixture has a stable ID for visual and accessibility tests.
 */
import type { App } from "@focus-notes/core";
import type { Contract } from "@focus-notes/ui/contracts";

export interface GalleryFixture { id: string; type: string; label: string }

export function galleryFixtures(contracts: readonly Contract[]): GalleryFixture[] {
  return contracts.flatMap((c) => c.fixtures.map((f, i) => ({ id: `${c.type}.${i}`, type: c.type, label: `${c.type}: ${f.name}` })));
}

export function galleryViews(contracts: readonly Contract[], scheme: "light" | "dark" = "light"): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const c of contracts) {
    c.fixtures.forEach((f, i) => {
      const node = { type: c.type, ...(f.props ? { props: f.props } : {}), ...(f.children ? { children: f.children } : {}), ...(f.slots ? { slots: f.slots } : {}) };
      const wrapped = c.type === "AppRoot"
        ? { ...node, id: "fixture" }
        : {
            type: "AppRoot",
            props: { scheme, platform: { get: "vm.app.platform" } },
            children: [{ type: "Center", props: { maxWidth: "wideContent" }, children: [{ type: "Stack", id: "fixture", props: { padding: "xl", align: "start" }, children: [node] }] }],
          };
      out[`gallery.${c.type}.${i}`] = { $schema: "https://prabinpebam.github.io/focus-notes/schemas/ui/view.v1.json", id: `gallery.${c.type}.${i}`, viewModels: ["vm.app", "vm.gallery"], focus: "fixture", root: wrapped };
    });
  }
  out["gallery.index"] = {
    $schema: "https://prabinpebam.github.io/focus-notes/schemas/ui/view.v1.json",
    id: "gallery.index",
    viewModels: ["vm.app", "vm.gallery"],
    focus: "gallery",
    root: {
      type: "AppRoot",
      props: { scheme, platform: { get: "vm.app.platform" } },
      children: [{
        type: "Center", props: { maxWidth: "dialogL" },
        children: [{
          type: "Stack", id: "gallery", props: { gap: "s", padding: "xl" },
          children: [
            { type: "Heading", props: { level: "1", value: { t: "gallery.title" } } },
            {
              each: { get: "vm.gallery.fixtures" }, as: "item", key: "item.id",
              render: { type: "Button", props: { label: { get: "item.label" }, variant: "subtle" }, on: { press: { run: "gallery.open", args: { id: { get: "item.id" } } } } },
              empty: { type: "Text", props: { value: { t: "gallery.empty" } } },
            },
          ],
        }],
      }],
    },
  };
  return out;
}

/** Registers the gallery's view model and its navigation command on an app. */
export function registerGallery(app: App, contracts: readonly Contract[], navigate: (id: string) => void): void {
  const fixtures = galleryFixtures(contracts);
  const item = (id: string, label: string, icon: string, extra: Record<string, unknown> = {}) => ({ id, label, icon, ...extra });
  const toolbar = [
    item("g.new", "New note", "newNote", { shortcut: "Ctrl+N" }),
    item("g.open", "Open…", "open", { shortcut: "Ctrl+O" }),
    item("g.search", "Search", "search", { disabled: true, reason: "Not available here" }),
    item("g.save", "Save", "save", { shortcut: "Ctrl+S" }),
    item("g.focus", "Focus mode", "focus", { checked: true }),
    item("g.theme", "Switch light and dark", "darkTheme", { checked: false }),
  ];
  const menu = [
    { id: "view", label: "View", items: [item("g.smaller", "Smaller text", "font", { shortcut: "Ctrl+-" }), item("g.larger", "Larger text", "font", { shortcut: "Ctrl+=", disabled: true })] },
    { id: "theme", label: "Theme", items: [item("g.system", "System", "color", { checked: true }), item("g.light", "Light", "lightTheme", { checked: false })] },
  ];
  const extras = {
    options: [{ id: "all", label: "All" }, { id: "basic", label: "Basic" }, { id: "writer", label: "Writer" }, { id: "power", label: "Power" }],
    optionFirst: "all",
    optionLast: "power",
    query: "bold",
    keysMac: ["⇧", "⌘", "L"],
    keysMacSpoken: "Shift Command L",
    keysPc: ["Ctrl", "Shift", "L"],
    keysPcSpoken: "Control Shift L",
    results: [
      { id: "all", label: "Heading 1", description: "Big section heading", icon: "heading1", shortcut: "Ctrl+Alt+1" },
      { id: "basic", label: "Bulleted list", icon: "bulletList" },
      { id: "writer", label: "Table", description: "Unavailable here", icon: "table", disabled: true },
    ],
    spotlight: [
      { id: "top:focus.toggle", group: "Top hit", label: "Focus mode", icon: "focus", highlights: [[0, 3]], state: "On", shortcut: "Ctrl+Shift+D" },
      { id: "notes:on-focus", group: "Notes", label: "On focus", icon: "document", highlights: [[3, 6]], description: "essays/on-focus.md · Public" },
      { id: "notes:sessions", group: "Notes", label: "Focus sessions", icon: "lock", highlights: [[0, 3]], description: "journal/focus-sessions.md · Private" },
      { id: "text:ideas", group: "In notes", label: "Ideas", icon: "text", description: "…keep a foc list of things to try.", descriptionHighlights: [[12, 15]], state: "ideas.md · Private" },
      { id: "settings:size", group: "Settings", label: "Text size", icon: "settings", state: "16 px" },
      { id: "actions:create", group: "Actions", label: "Create note “foc”", icon: "add", shortcut: "Ctrl+N" },
      { id: "actions:find", group: "Actions", label: "Find “foc” in all notes", icon: "search", description: "Unavailable here", disabled: true },
    ],
    spotlightFirst: "top:focus.toggle",
    tree: [
      { id: "root:private", kind: "section", level: 1, label: "Private", expanded: true, hasChildren: true },
      { id: "journal", kind: "folder", level: 2, label: "journal", parent: "root:private", expanded: true, hasChildren: true, draggable: true, droppable: true },
      { id: "journal/2026-10-13.md", kind: "note", level: 3, label: "2026-10-13", parent: "journal", title: "2026-10-13.md", selected: true, draggable: true },
      { id: "journal/2026-10-12.md", kind: "note", level: 3, label: "2026-10-12", parent: "journal", title: "2026-10-12.md", selected: true, pending: true, draggable: true },
      { id: "drafts", kind: "folder", level: 2, label: "drafts", parent: "root:private", expanded: false, hasChildren: true, draggable: true, droppable: true },
      { id: "spec-ideas.md", kind: "note", level: 2, label: "Spec ideas", parent: "root:private", title: "spec-ideas.md", current: true, draggable: true },
      { id: "root:public", kind: "section", level: 1, label: "Public", expanded: true, hasChildren: true },
      { id: "public:About.md", kind: "note", level: 2, label: "About", parent: "root:public", description: "read-only", readOnly: true },
    ],
    treeFocus: "journal/2026-10-12.md",
    treeEditing: [
      { id: "root:private", kind: "section", level: 1, label: "Private", expanded: true, hasChildren: true },
      { id: "new:", kind: "folder", level: 2, label: "bold", parent: "root:private", editing: true },
      { id: "spec-ideas.md", kind: "note", level: 2, label: "Spec ideas", parent: "root:private" },
    ],
    treeEditLabel: "Folder name",
    treeEditError: "That name is taken here.",
    versionBlocks: [
      { id: "m0", text: "# On focus", changed: false },
      { id: "m1", text: "Attention is a garden.", changed: false },
      { id: "m2", text: "Written on this computer, on the train.", changed: true },
      { id: "m3", text: "- one\n- two", changed: false },
    ],
    versionEmpty: [],
    snapLayouts: [
      { id: "halves", label: "Halves", items: [{ id: "g.left", label: "Left half" }, { id: "g.right", label: "Right half" }] },
      { id: "thirds", label: "Thirds", items: [{ id: "g.leftThird", label: "Left third" }, { id: "g.centerThird", label: "Center third" }, { id: "g.rightThird", label: "Right third" }] },
      { id: "quarters", label: "Quarters", items: [{ id: "g.tl", label: "Top left quarter" }, { id: "g.tr", label: "Top right quarter" }, { id: "g.bl", label: "Bottom left quarter" }, { id: "g.br", label: "Bottom right quarter" }] },
      { id: "maximize", label: "Full", items: [{ id: "g.max", label: "Maximize" }] },
    ],
  };
  const ITEM = { type: "object" as const, properties: { id: { type: "string" as const }, label: { type: "string" as const }, icon: { type: "string" as const }, shortcut: { type: "string" as const }, checked: { type: "boolean" as const }, disabled: { type: "boolean" as const }, reason: { type: "string" as const } } };
  app.viewModels.register({
    id: "vm.gallery",
    schema: {
      type: "object",
      properties: {
        fixtures: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" } } } },
        toolbar: { type: "array", items: ITEM },
        menu: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, items: { type: "array", items: ITEM } } } },
        options: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" } } } },
        optionFirst: { type: "string" },
        optionLast: { type: "string" },
        query: { type: "string" },
        keysMac: { type: "array", items: { type: "string" } },
        keysMacSpoken: { type: "string" },
        keysPc: { type: "array", items: { type: "string" } },
        keysPcSpoken: { type: "string" },
        results: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, description: { type: "string" }, icon: { type: "string" }, shortcut: { type: "string" }, disabled: { type: "boolean" } } } },
        spotlight: { type: "array", items: { type: "object" } },
        spotlightFirst: { type: "string" },
        tree: { type: "array", items: { type: "object" } },
        treeFocus: { type: "string" },
        treeEditing: { type: "array", items: { type: "object" } },
        treeEditLabel: { type: "string" },
        treeEditError: { type: "string" },
        versionBlocks: { type: "array", items: { type: "object", properties: { id: { type: "string" }, text: { type: "string" }, changed: { type: "boolean" } } } },
        versionEmpty: { type: "array", items: { type: "object", properties: { id: { type: "string" }, text: { type: "string" }, changed: { type: "boolean" } } } },
        snapLayouts: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, items: { type: "array", items: ITEM } } } },
      },
    },
    select: () => ({ fixtures, toolbar, menu, ...extras }),
  });
  app.commands.register<{ id: string }>({ id: "gallery.open", title: "gallery.title", run: ({ id }) => navigate(String(id)) });
}
