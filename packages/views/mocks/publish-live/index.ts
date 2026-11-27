/**
 * D-436 (owner, 27 November 10:35): a published file's live status on its globe badge, in the tree, Pinned,
 * Recent and Opened files. Right after Publish, Unpublish or an update the globe waits in the warning colour
 * inside the commit mark's own-border pending arc until the page itself answers on GitHub Pages with the new
 * build; then a success outline (held at least 200 ms) and the accent; or, after a failed deploy or 10 minutes,
 * danger, with the reason in the tooltip and Retry publish and View on GitHub in the file's menu. A public note
 * in a Private + Public project keeps the accent globe once live (main, 27 November 10:49).
 * Spec: documentations/experience/files-and-sharing.md.
 */
import { shareFilesMocks } from "../share-files/index.ts";

type Entry = { id: string; label: string; view: string; local?: Record<string, string | number | boolean> };
type Item = { id: string } & Record<string, unknown>;
type Model = Record<string, unknown> & { files: Record<string, unknown> & { items: Item[]; shortcuts: Item[]; rowMenu: unknown }; opened: { items: Item[]; menu: unknown } };

const SITE = "https://ada.github.io/notes/n/";
const STATES = {
  pending: { siteLive: "pending", about: () => "Publishing · waiting for GitHub Pages to go live" },
  confirmed: { siteLive: "confirmed", about: (slug: string) => `Published · live at ${SITE}${slug}/` },
  failed: { siteLive: "failed", about: () => "Not live yet · GitHub Pages couldn't build your site" },
  live: { siteLive: undefined, about: (slug: string) => `Published · live at ${SITE}${slug}/` },
} as const;
const base = shareFilesMocks.models.sfPanel as unknown as Model;
const withState = (state: keyof typeof STATES): Model => {
  const { siteLive, about } = STATES[state];
  const published = (slug: string, live: boolean) => ({ published: true, shared: false, siteLabel: "Published",
    siteDescription: live ? about(slug) : STATES.live.about(slug), ...(live && siteLive ? { siteLive } : {}) });
  const mark = (i: Item): Item => {
    // A Private + Public project: only notes under the public notes/ are published; a private note never shows the globe.
    if (i.id === "reading-list.md") return { ...i, published: false, shared: true, siteLabel: "Shared", siteDescription: "Shared privately · anyone with the link and code can open it · until 26 Dec" };
    if (i.id === "public:garden.md") return { ...i, ...published("garden", true) };
    if (i.id === "public:about.md") return { ...i, ...published("about/notes-on-the-long-and-winding-road-to-a-calm-markdown-writing-app-and-why-it", false) };
    // Every other private note: shared at most, never published.
    if (!String(i.id).startsWith("public:") && i.published) {
      const { published: _p, siteLabel: _l, siteDescription: _d, ...rest } = i;
      return i.shared ? { ...rest, shared: true, siteLabel: "Shared", siteDescription: "Shared privately · anyone with the link and code can open it · until 26 Dec" } : rest as Item;
    }
    return i;
  };
  const rowMenu = state === "failed" ? [
    { id: "m0", items: [{ id: "files.openItem", label: "Open", shortcut: "" }, { id: "files.pinItem", label: "Pin", shortcut: "" }] },
    { id: "mLive", items: [{ id: "files.liveRetry", label: "Retry publish", shortcut: "" }, { id: "files.liveGitHub", label: "View on GitHub", shortcut: "" }] },
    { id: "m2", items: [{ id: "files.unpublish", label: "Unpublish", shortcut: "" }] },
    { id: "m5", items: [{ id: "files.delete", label: "Delete", shortcut: "Delete" }] },
  ] : base.files.rowMenu;
  return {
    ...base,
    files: { ...base.files, items: base.files.items.map(mark), shortcuts: base.files.shortcuts.map(mark), rowMenu },
    opened: { ...base.opened, items: [...base.opened.items.filter((i) => i.id !== "reading-list.md"), { id: "public:garden.md", kind: "note", level: 1, label: "Garden notes", title: "notes/garden.md" }].map(mark) },
  };
};
const docs = shareFilesMocks.views as unknown as Record<string, { root: unknown }>;
/**
 * D-436 (main, 13:27): the pin in its own place at the row's end, never over the badges: a private-only project's
 * pinned published note and pinned shared-and-published note, in Pinned and in the tree.
 */
const pinsModel = (): Model => {
  const both = { shared: true, published: true, siteLabel: "Shared and published", siteDescription: "Shared privately · anyone with the link and code can open it · until 26 Dec · Published · live at https://ada.github.io/notes/n/reading-list/" };
  const pub = { published: true, shared: false, siteLabel: "Published", siteDescription: "Published · live at https://ada.github.io/notes/n/roadmap/" };
  const pinned = (label: string) => ({ pinned: true, pinLabel: `Unpin ${label}`, pinCommit: "rest" });
  const items: Item[] = [
    { id: "root:private", kind: "section", level: 1, label: "Private", expanded: true, hasChildren: true },
    { id: "reading-list.md", kind: "note", level: 2, label: "Reading list", parent: "root:private", title: "reading-list.md", ...both, ...pinned("Reading list") },
    { id: "roadmap.md", kind: "note", level: 2, label: "Roadmap", parent: "root:private", title: "roadmap.md", ...pub, ...pinned("Roadmap") },
    { id: "spec-ideas.md", kind: "note", level: 2, label: "Spec ideas", parent: "root:private", title: "spec-ideas.md", pinned: false, pinLabel: "Pin Spec ideas", pinCommit: "rest" },
  ];
  const shortcuts: Item[] = [
    { id: "root:pinned", kind: "section", level: 1, label: "Pinned", expanded: true, hasChildren: true },
    { id: "reading-list.md", kind: "note", level: 2, label: "Reading list", parent: "root:pinned", detail: "Root", ...both, ...pinned("Reading list") },
    { id: "roadmap.md", kind: "note", level: 2, label: "Roadmap", parent: "root:pinned", detail: "Root", ...pub, ...pinned("Roadmap") },
  ];
  return { ...base, files: { ...base.files, items, shortcuts }, opened: { ...base.opened, items: [{ id: "spec-ideas.md", kind: "note", level: 1, label: "Spec ideas", title: "spec-ideas.md", current: true }] } };
};
const view = (model: string, from: string, id: string) => {
  const swap = (node: unknown): unknown => Array.isArray(node) ? node.map(swap)
    : node && typeof node === "object" ? Object.fromEntries(Object.entries(node).map(([k, v]) => [k, swap(v)]))
      : typeof node === "string" ? node.replace(/^vm\.sfPanel\b/, `vm.${model}`) : node;
  return { id: `gallery.mock.${id}`, focus: "files", root: swap(docs[from]!.root) };
};

export const publishLiveMocks = {
  id: "publishLive",
  label: "Mocks: a published file's live status (27 November, D-436)",
  models: { plPending: withState("pending"), plConfirmed: withState("confirmed"), plFailed: withState("failed"), plLive: withState("live"), plPins: pinsModel() },
  views: {
    pending: view("plPending", "panel", "publishLive.pendingDoc"),
    confirmed: view("plConfirmed", "panel", "publishLive.confirmedDoc"),
    live: view("plLive", "panel", "publishLive.liveDoc"),
    failed: view("plFailed", "panel", "publishLive.failedDoc"),
    failedMenu: view("plFailed", "menu", "publishLive.failedMenuDoc"),
    pins: view("plPins", "panel", "publishLive.pinsDoc"),
  },
  entries: [
    { id: "publishLive.pending", label: "1. Publishing: the globe waits in amber inside the pending arc", view: "pending" },
    { id: "publishLive.confirmed", label: "2. Live: a green outline, held at least 200 ms", view: "confirmed" },
    { id: "publishLive.live", label: "3. Then the accent globe: Published · live at the page's address", view: "live" },
    { id: "publishLive.failed", label: "4. Not live yet: danger, the reason in the tooltip", view: "failed" },
    { id: "publishLive.failedMenu", label: "5. The file's menu: Retry publish, View on GitHub", view: "failedMenu" },
    { id: "publishLive.pins", label: "6. The pin in its own place at the row's end, never over the badges (point to a row)", view: "pins" },
  ] as Entry[],
};
