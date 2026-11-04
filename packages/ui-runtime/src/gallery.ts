/**
 * The gallery (DSY-09): every component fixture as its own view document, rendered through the
 * same runtime as the app. Each fixture has a stable ID for visual and accessibility tests.
 */
import { BLOCK_LIST_SCHEMA, type App } from "@focus-notes/core";
import type { Contract } from "@focus-notes/ui/contracts";
import { mocks, mockData } from "@focus-notes/views";
import { VIEW_SCHEMA_URL } from "./migrate.ts";
import { cssVarName } from "@focus-notes/tokens";

export interface GalleryAppearance { scheme?: "light" | "dark"; motion?: "system" | "reduced" }

export interface GalleryFixture { id: string; type: string; label: string }

/**
 * A group of design mocks (strict design mode): view documents over fake data, not wired to anything.
 * Each entry opens one of the group's views with its own starting local state.
 */
export interface MockGroup {
  id: string;
  label: string;
  /** Fake data, each registered as a view model `vm.<name>` whose schema is read from the data. */
  models: Record<string, unknown>;
  views: Record<string, unknown>;
  entries: readonly { id: string; label: string; view: string; local?: Record<string, string | number | boolean> }[];
}

export function galleryFixtures(contracts: readonly Contract[]): GalleryFixture[] {
  return contracts.flatMap((c) => c.fixtures.map((f, i) => ({ id: `${c.type}.${i}`, type: c.type, label: `${c.type}: ${f.name}` })));
}
export function galleryViews(contracts: readonly Contract[], scheme: "light" | "dark" = "light", mockGroups: readonly MockGroup[] = [], motion: "system" | "reduced" = "system"): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const group of mockGroups) for (const entry of group.entries) {
    const doc = group.views[entry.view] as { focus?: string; local?: Record<string, unknown>; root: unknown };
    const id = `gallery.mock.${entry.id}`;
    out[id] = {
      $schema: VIEW_SCHEMA_URL, id,
      viewModels: ["vm.app", "vm.gallery", ...Object.keys(group.models).map((m) => `vm.${m}`)],
      ...(doc.focus ? { focus: doc.focus } : {}),
      local: { ...doc.local, ...entry.local },
      // AppRoot clips the document; long review boards need their own viewport-bounded scroller.
      root: { type: "AppRoot", props: { scheme, motion, platform: { get: "vm.app.platform" } }, children: [
        group.id === "uistates" ? { type: "Surface", props: { variant: "canvas", scroll: true }, children: [doc.root] } : doc.root,
      ] },
    };
  }
  for (const c of contracts) {
    c.fixtures.forEach((f, i) => {
      // A component that names its parts from its id gets one, as a view would give it (D-199).
      const node = { type: c.type, ...(c.requiresId ? { id: `fixture-${c.type}` } : {}), ...(f.props ? { props: f.props } : {}), ...(f.children ? { children: f.children } : {}), ...(f.slots ? { slots: f.slots } : {}) };
      const wrapped = c.type === "AppRoot"
        ? { ...node, id: "fixture" }
        : {
            type: "AppRoot",
            props: { scheme, platform: { get: "vm.app.platform" } },
            children: [{ type: "Center", props: { maxWidth: "wideContent" }, children: [{ type: "Stack", id: "fixture", props: { padding: "xl", align: "start" }, children: [node] }] }],
          };
      out[`gallery.${c.type}.${i}`] = { $schema: VIEW_SCHEMA_URL, id: `gallery.${c.type}.${i}`, viewModels: ["vm.app", "vm.gallery"], focus: "fixture", root: wrapped };
    });
  }
  const glyphRows = contracts.flatMap((c) => c.fixtures
    .filter((f) => f.name.startsWith("glyph bounds"))
    .map((f) => ({ type: c.type, props: f.props })));
  const primaries = glyphRows.filter((n) => n.type === "Button" && n.props?.variant === "primary");
  const companions = glyphRows.filter((n) => n.type !== "Button" || n.props?.variant !== "primary");
  for (const context of ["normal", "floating"]) for (const [index, primary] of primaries.entries()) {
    // Each educational matrix is still a surface with just one primary action.
    const specimens = [primary, ...companions];
    const matrix = {
      type: "Stack", id: "glyph-controls", props: { padding: "m", gap: "s" },
      children: [
        { type: "Heading", props: { level: "2", value: { t: "gallery.glyphs.title" } } },
        ...Array.from({ length: Math.ceil(specimens.length / 3) }, (_, i) => ({
          type: "Inline", props: { gap: "s", wrap: true }, children: specimens.slice(i * 3, i * 3 + 3),
        })),
      ],
    };
    out[`gallery.controls.${context}.${index}`] = {
      $schema: VIEW_SCHEMA_URL, id: `gallery.controls.${context}.${index}`, viewModels: ["vm.app", "vm.gallery"], focus: "glyph-controls",
      root: {
        type: "AppRoot", props: { scheme, platform: { get: "vm.app.platform" } },
        children: context === "floating"
          ? [{ type: "Layer", props: { position: "center" }, children: [{ type: "Surface", props: { variant: "raised", padding: "none" }, children: [matrix] }] }]
          : [{ type: "Center", props: { maxWidth: "wideContent" }, children: [matrix] }],
      },
    };
  }
  // The UX mocks awaiting the owner's review (strict design): clickable flows on fake data, nothing wired.
  Object.assign(out, mocks);
  out["gallery.index"] = {
    $schema: VIEW_SCHEMA_URL,
    id: "gallery.index",
    viewModels: ["vm.app", "vm.gallery", "vm.mocks"],
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
            { type: "Heading", props: { level: "2", value: { t: "project.mock.section" } } },
            {
              each: { get: "vm.mocks.list" }, as: "mock", key: "mock.id",
              render: { type: "Button", props: { label: { get: "mock.label" }, variant: "subtle", icon: "sparkle" }, on: { press: { run: "gallery.open", args: { id: { get: "mock.id" } } } } },
              empty: { type: "Text", props: { value: { t: "gallery.empty" } } },
            },
            { type: "Heading", props: { level: "2", value: { t: "project.mock.components" } } },
            {
              each: { get: "vm.gallery.mockGroups" }, as: "group", key: "group.id",
              render: {
                type: "Stack", props: { gap: "s" }, children: [
                  { type: "Heading", props: { level: "2", value: { get: "group.label" } } },
                  {
                    each: { get: "group.entries" }, as: "entry", key: "entry.id",
                    render: { type: "Button", props: { label: { get: "entry.label" }, variant: "subtle" }, on: { press: { run: "gallery.open", args: { id: { get: "entry.key" } } } } },
                    empty: { type: "Text", props: { value: { t: "gallery.empty" } } },
                  },
                  { type: "Divider" },
                ],
              },
              empty: { type: "Text", props: { value: { t: "gallery.empty" } } },
            },
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
export function registerGallery(app: App, contracts: readonly Contract[], navigate: (id: string, appearance?: GalleryAppearance) => void, mockGroups: readonly MockGroup[] = []): void {
  const fixtures = galleryFixtures(contracts);
  for (const group of mockGroups) for (const [name, data] of Object.entries(group.models)) {
    app.viewModels.register({ id: `vm.${name}`, schema: schemaOf(data) as never, select: () => data as never });
  }
  const mocks = mockGroups.map((g) => ({ id: g.id, label: g.label, entries: g.entries.map((e) => ({ id: e.id, key: `mock.${e.id}`, label: e.label })) }));
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
    actionOptions: [{ id: "left", label: "Rotate left", icon: "undo" }, { id: "right", label: "Rotate right", icon: "rotate" }, { id: "reset", label: "Reset" }],
    localPath: "C:\\Users\\Prabin\\Documents\\Focus Notes\\Local notes",
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
    // Spotlight: labeled groups (a header item heads each), matches marked, and each row's state.
    spotlight: [
      { id: "h:top", label: "Top hit", header: true },
      { id: "top:focus.toggle", label: "Focus mode", icon: "focus", highlights: [[0, 3]], state: "On", shortcut: "Ctrl+Shift+D" },
      { id: "h:notes", label: "Notes", header: true },
      { id: "notes:on-focus", label: "On focus", icon: "document", highlights: [[3, 6]], description: "essays/on-focus.md · Public" },
      { id: "notes:sessions", label: "Focus sessions", icon: "lock", highlights: [[0, 3]], description: "journal/focus-sessions.md · Private" },
      { id: "h:text", label: "In notes", header: true },
      { id: "text:ideas", label: "Ideas", icon: "text", description: "…keep a foc list of things to try.", descriptionHighlights: [[12, 15]], state: "ideas.md · Private" },
      { id: "h:commands", label: "Commands", header: true },
      { id: "commands:window", label: "Open in new window", icon: "fullScreen", description: "Unavailable here", disabled: true },
      { id: "h:settings", label: "Settings", header: true },
      { id: "settings:size", label: "Text size", icon: "settings", state: "16 px" },
      { id: "h:actions", label: "Actions", header: true },
      { id: "actions:create", label: "Create note “foc”", icon: "add", shortcut: "Ctrl+N" },
      { id: "actions:find", label: "Find “foc” in all notes", icon: "search" },
    ],
    spotlightFirst: "top:focus.toggle",
    // Find in all notes: a note's heading with its path and count, then its matching lines with the match marked.
    matches: [
      { id: "h:0", label: "On focus", description: "essays/on-focus.md · Public · 2 matches", header: true },
      { id: "0:0", label: "Attention is a garden, and focus its gate.", highlights: [[33, 38]] },
      { id: "0:1", label: "…one line at a time, in focus.", highlights: [[25, 30]] },
      { id: "h:1", label: "Focus sessions", description: "journal/focus-sessions.md · Private · 1 match", header: true },
      { id: "1:0", label: "Focus sessions", highlights: [[0, 5]] },
    ],
    matchFirst: "0:1",
    tree: [
      { id: "root:private", kind: "section", level: 1, label: "Private", expanded: true, hasChildren: true },
      { id: "journal", kind: "folder", level: 2, label: "journal", parent: "root:private", expanded: true, hasChildren: true, draggable: true, droppable: true },
      { id: "journal/2026-10-13.md", kind: "note", level: 3, label: "2026-10-13", parent: "journal", title: "2026-10-13.md", selected: true, draggable: true },
      { id: "journal/2026-10-12.md", kind: "note", level: 3, label: "2026-10-12", parent: "journal", title: "2026-10-12.md", selected: true, pending: true, draggable: true },
      { id: "drafts", kind: "folder", level: 2, label: "drafts", parent: "root:private", expanded: false, hasChildren: true, draggable: true, droppable: true },
      { id: "spec-ideas.md", kind: "note", level: 2, label: "Spec ideas", parent: "root:private", title: "spec-ideas.md", detail: "spec-ideas.md", current: true, draggable: true },
      { id: "root:public", kind: "section", level: 1, label: "Public", expanded: true, hasChildren: true },
      { id: "public:About.md", kind: "note", level: 2, label: "About", parent: "root:public", description: "read-only", readOnly: true },
    ],
    treeFocus: "journal/2026-10-12.md",
    treePins: [
      { id: "ideas", kind: "folder", level: 1, label: "Ideas", pinLabel: "Pin Ideas", pinned: false, pinCommit: "rest" },
      { id: "pending.md", kind: "note", level: 1, label: "Saving pin", pinLabel: "Pin Saving pin", pinned: false, pinCommit: "pending" },
      { id: "confirmed.md", kind: "note", level: 1, label: "Pinned", pinLabel: "Unpin Pinned", pinned: true, pinCommit: "confirmed" },
      { id: "failed.md", kind: "note", level: 1, label: "Pin not saved", pinLabel: "Pin Pin not saved", pinned: false, pinCommit: "failed" },
    ],
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
    noteBlocks: [
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "On focus" }] },
      { type: "paragraph", content: [{ type: "text", text: "Attention is a " }, { type: "text", text: "garden", marks: [{ type: "italic" }] }, { type: "text", text: ", tended " }, { type: "text", text: "daily", marks: [{ type: "bold" }] }, { type: "text", text: ". See " }, { type: "text", text: "the essay", marks: [{ type: "link", attrs: { href: "#on-focus" } }] }, { type: "text", text: " and " }, { type: "text", text: "code", marks: [{ type: "code" }] }, { type: "text", text: "." }] },
      { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "One" }] }] }, { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Two" }] }] }] },
      { type: "taskList", content: [{ type: "taskItem", attrs: { checked: true }, content: [{ type: "paragraph", content: [{ type: "text", text: "Water the plants" }] }] }, { type: "taskItem", attrs: { checked: false }, content: [{ type: "paragraph", content: [{ type: "text", text: "Write" }] }] }] },
      { type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "Quiet is a skill." }] }] },
      { type: "codeBlock", attrs: { language: "js" }, content: [{ type: "text", text: "const calm = true;" }] },
      { type: "table", content: [{ type: "tableRow", content: [{ type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Day" }] }] }, { type: "tableHeader", attrs: { align: "right" }, content: [{ type: "paragraph", content: [{ type: "text", text: "Words" }] }] }] }, { type: "tableRow", content: [{ type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "Monday" }] }] }, { type: "tableCell", attrs: { align: "right" }, content: [{ type: "paragraph", content: [{ type: "text", text: "800" }] }] }] }] },
      { type: "horizontalRule" },
      { type: "rawMarkdown", attrs: { source: "<details>kept verbatim</details>" } },
    ],
    themeTiles: [
      { id: "paper", label: "Paper", kind: "light", slot: "Light ✓", badge: "AAA", description: "light, AAA" },
      { id: "ink", label: "Ink", kind: "dark", slot: "Dark ✓", badge: "AAA", description: "dark, AAA" },
      { id: "sepia", label: "Sepia", kind: "light", badge: "AAA", description: "light, AAA" },
      { id: "dusk", label: "Dusk", kind: "dark", badge: "AAA", description: "dark, AAA" },
      { id: "contrast-light", label: "High contrast", kind: "light", badge: "AAA", description: "light, AAA" },
    ],
    themeFirst: "paper",
    themeDark: "dusk",
    colorHex: "#2f5fd0",
    // A link's address (the product site's SiteLink, WP-10.1): the gallery itself, so following it goes nowhere new.
    href: "#gallery",
    // An uploaded project logo after sanitizing (D-294): a passive SVG as a data URL.
    logoSrc: mockData.logoSrc,
    initials: "W",
    imageSrc: mockData.harbourSrc,
    // The product site's theme swatches (SiteThemeShowcase, D-176).
    siteThemes: [
      { id: "paper", label: "Paper", scheme: "light", src: "#gallery", alt: "Paper" },
      { id: "sepia", label: "Sepia", scheme: "light", src: "#gallery", alt: "Sepia" },
      { id: "ink", label: "Ink", scheme: "dark", src: "#gallery", alt: "Ink" },
    ],
    colorValues: [{ id: "color.accent", value: "#9a3412" }, { id: "color.link", value: "#9a3412" }],
    // The right-click menu in text (TextMenu, D-204): a misspelled word's suggestions, then the edit actions, Cut unavailable.
    textMenu: [
      { id: "textMenu0", items: [{ id: "s0", label: "mistake" }, { id: "s1", label: "mistakes" }] },
      { id: "textMenu1", items: [{ id: "learn", label: "Add to dictionary" }] },
      { id: "textMenu2", items: [{ id: "cut", label: "Cut", shortcut: "Ctrl+X", disabled: true }, { id: "copy", label: "Copy", shortcut: "Ctrl+C" }, { id: "paste", label: "Paste", shortcut: "Ctrl+V" }] },
      { id: "textMenu3", items: [{ id: "selectAll", label: "Select all", shortcut: "Ctrl+A" }] },
    ],
    snapLayouts: [
      { id: "halves", label: "Halves", items: [{ id: "g.left", label: "Left half" }, { id: "g.right", label: "Right half" }] },
      { id: "thirds", label: "Thirds", items: [{ id: "g.leftThird", label: "Left third" }, { id: "g.centerThird", label: "Center third" }, { id: "g.rightThird", label: "Right third" }] },
      { id: "quarters", label: "Quarters", items: [{ id: "g.tl", label: "Top left quarter" }, { id: "g.tr", label: "Top right quarter" }, { id: "g.bl", label: "Bottom left quarter" }, { id: "g.br", label: "Bottom right quarter" }] },
      { id: "maximize", label: "Full", items: [{ id: "g.max", label: "Maximize" }] },
    ],
  };
  const ITEM = { type: "object" as const, properties: { id: { type: "string" as const }, label: { type: "string" as const }, icon: { type: "string" as const }, shortcut: { type: "string" as const }, checked: { type: "boolean" as const }, disabled: { type: "boolean" as const }, reason: { type: "string" as const } } };
  const TREE_ITEM = { type: "object" as const, properties: { id: { type: "string" as const }, kind: { type: "string" as const }, level: { type: "number" as const }, label: { type: "string" as const }, detail: { type: "string" as const } } };
  app.viewModels.register({
    id: "vm.gallery",
    schema: {
      type: "object",
      properties: {
        fixtures: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" } } } },
        mockGroups: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, entries: { type: "array", items: { type: "object", properties: { id: { type: "string" }, key: { type: "string" }, label: { type: "string" } } } } } } },
        toolbar: { type: "array", items: ITEM },
        menu: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, items: { type: "array", items: ITEM } } } },
        options: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" } } } },
        actionOptions: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, icon: { type: "string" } } } },
        localPath: { type: "string" },
        optionFirst: { type: "string" },
        optionLast: { type: "string" },
        query: { type: "string" },
        keysMac: { type: "array", items: { type: "string" } },
        keysMacSpoken: { type: "string" },
        keysPc: { type: "array", items: { type: "string" } },
        keysPcSpoken: { type: "string" },
        results: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, description: { type: "string" }, icon: { type: "string" }, shortcut: { type: "string" }, disabled: { type: "boolean" } } } },
        spotlight: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, description: { type: "string" }, icon: { type: "string" }, disabled: { type: "boolean" }, header: { type: "boolean" }, state: { type: "string" } } } },
        spotlightFirst: { type: "string" },
        matches: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, description: { type: "string" }, header: { type: "boolean" }, highlights: { type: "array", items: { type: "array", items: { type: "number" } } } } } },
        matchFirst: { type: "string" },
        tree: { type: "array", items: TREE_ITEM },
        treePins: { type: "array", items: TREE_ITEM },
        treeFocus: { type: "string" },
        treeEditing: { type: "array", items: TREE_ITEM },
        treeEditLabel: { type: "string" },
        treeEditError: { type: "string" },
        versionBlocks: { type: "array", items: { type: "object", properties: { id: { type: "string" }, text: { type: "string" }, changed: { type: "boolean" } } } },
        noteBlocks: BLOCK_LIST_SCHEMA,
        versionEmpty: { type: "array", items: { type: "object", properties: { id: { type: "string" }, text: { type: "string" }, changed: { type: "boolean" } } } },
        themeTiles: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, kind: { type: "string" }, slot: { type: "string" }, badge: { type: "string" }, description: { type: "string" }, group: { type: "string" }, sample: { type: "string" }, colors: { type: "array", items: { type: "object", properties: { id: { type: "string" }, value: { type: "string" } } } } } } },
        themeFirst: { type: "string" },
        themeDark: { type: "string" },
        colorHex: { type: "string" },
        href: { type: "string" },
        logoSrc: { type: "string" },
        initials: { type: "string" },
        imageSrc: { type: "string" },
        siteThemes: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, scheme: { type: "string" }, src: { type: "string" }, alt: { type: "string" } } } },
        colorValues: { type: "array", items: { type: "object", properties: { id: { type: "string" }, value: { type: "string" } } } },
        snapLayouts: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, items: { type: "array", items: ITEM } } } },
        textMenu: { type: "array", items: { type: "object", properties: { id: { type: "string" }, items: { type: "array", items: ITEM } } } },
      },
    },
    select: () => ({ fixtures, mockGroups: mocks, toolbar, menu, ...extras }),
  });
  // Note blocks keep the editor's own block schema; everything else is read off the fake data.
  const mockSchema = schemaOf(mockData) as { properties: Record<string, unknown> };
  for (const k of Object.keys(mockSchema.properties)) if (k.endsWith("Blocks")) mockSchema.properties[k] = BLOCK_LIST_SCHEMA;
  app.viewModels.register({ id: "vm.mocks", schema: mockSchema as never, select: () => mockData });
  app.commands.register<{ id: string; scheme?: "light" | "dark"; motion?: "system" | "reduced" }>({ id: "gallery.open", title: "gallery.title", run: ({ id, scheme, motion }) => navigate(String(id), { ...(scheme ? { scheme } : {}), ...(motion ? { motion } : {}) }) });
  app.commands.register<{ duration: "confirmMinimum" | "doneDuration" | "noticeLong" | "toastDuration" | "signDelay" | "signMinimum" }>({
    id: "gallery.wait", title: "gallery.title",
    run: async ({ duration }) => {
      const value = getComputedStyle(document.documentElement).getPropertyValue(cssVarName(`wait.${duration}`)).trim();
      const ms = parseFloat(value) * (value.endsWith("ms") ? 1 : 1000);
      if (!Number.isFinite(ms) || ms < 0) throw new Error(`Missing gallery timing token: wait.${duration}`);
      await new Promise<void>((resolve) => setTimeout(resolve, ms));
    },
  });
}

/** A JSON Schema read off fake data, so the mocks' view model needs no hand-kept schema. */
function schemaOf(v: unknown): Record<string, unknown> {
  if (Array.isArray(v)) {
    const props: Record<string, unknown> = {};
    for (const item of v) if (item && typeof item === "object" && !Array.isArray(item)) Object.assign(props, (schemaOf(item) as { properties: object }).properties);
    return { type: "array", items: v.length && (typeof v[0] !== "object" || Array.isArray(v[0])) ? schemaOf(v[0]) : { type: "object", properties: props } };
  }
  if (v && typeof v === "object") return { type: "object", properties: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, schemaOf(x)])) };
  return { type: typeof v === "number" ? "number" : typeof v === "boolean" ? "boolean" : "string" };
}