/**
 * The Open view (owner, 4 November; approved 5 November and wired, D-352): the app's own Open view
 * document over fake data, so the mock and the built screen are the same document. Its actions are
 * left out here. Spec: documentations/experience/projects.md (Open).
 *
 * The project card's size line (D-346, PRJ-22) is formatted by the app's view model in the wired view;
 * here it's formatted from each entry's counts, so the mock shows every wording without the app.
 * Shimmer on project tints (D-353): the counting card in every accent, under light, dark and contrast themes.
 */
import projects from "../../views/projects.view.json" with { type: "json" };
import data from "./data.json" with { type: "json" };
import states from "./states.json" with { type: "json" };
import tints from "./tints.json" with { type: "json" };
import { compose } from "../../src/compose.ts";

type Entry = { id: string; label: string; view: string; local?: Record<string, string | number | boolean> };
type Node = Record<string, unknown>;

const mockOf = (node: unknown, model: string): unknown => {
  if (Array.isArray(node)) return node.map((n) => mockOf(n, model));
  if (!node || typeof node !== "object") return typeof node === "string" ? node.replace(/^vm\.projects\b/, `vm.${model}`) : node;
  return Object.fromEntries(Object.entries(node).filter(([k]) => k !== "on").map(([k, v]) => [k === "bind" ? "get" : k, mockOf(v, model)]));
};

const statsLine = { stats: { t: "project.open.stats", args: { size: { get: "entry.size" }, files: { get: "entry.files" }, media: { get: "entry.media" }, folders: { get: "entry.folders" } } } };
const withCard = (node: unknown): unknown => {
  if (Array.isArray(node)) return node.map(withCard);
  if (!node || typeof node !== "object") return node;
  const n = Object.fromEntries(Object.entries(node).map(([k, v]) => [k, withCard(v)])) as Node;
  const props = n.props as Node | undefined;
  return n.type === "OpenItem" && props?.kind === "project" ? { ...n, props: { ...props, ...statsLine } } : n;
};
/** Other mock groups (Delete's Open after deletion) build Open with this, so they show the approved card too. */
export const view = (model: string) => withCard(mockOf(compose(projects), model)) as Node;

// One full-width group per theme keeps project names and paths legible in the gallery.
const tintColumn = (theme: string) => ({
  type: "ProjectScope", props: { theme, part: "window" },
  children: [{
    type: "Stack", props: { gap: "stackItem", padding: "insetMd" },
    children: [
      { type: "Text", props: { value: { get: `vm.openTints.themes.${theme.replace("-light", "Light").replace("-dark", "Dark")}` }, role: "label", tone: "muted" } },
      { each: { get: "vm.openTints.entries" }, as: "entry", key: "entry.id", empty: { type: "Text", props: { value: { get: "vm.openTints.empty" }, tone: "muted" } }, render: {
        type: "OpenItem",
        props: { kind: "project", title: { get: "entry.name" }, path: { get: "entry.folder" }, accent: { get: "entry.accent" }, logo: { get: "entry.logo" }, statsBusy: true },
      } },
    ],
  }],
});
const tintsView = {
  id: "gallery.mock.openTints",
  focus: "tints",
  root: { type: "Stack", id: "tints", props: { gap: "stackSection", padding: "insetLg" },
    children: ["app", "paper", "ink", "sepia", "contrast-light", "contrast-dark"].map(tintColumn) },
};

export const openMocks = {
  id: "open",
  label: "Mocks: Open (4 and 5 November)",
  // The card states show only cards' own pins: the borrowed recent list has none pinned, so no recent row's pin sits beside a card.
  models: { openMock: data, openStates: { ...data, recent: data.recent.map((r) => ({ ...r, pinned: false })), entries: states.entries }, openTints: tints },
  views: {
    open: { ...view("openMock"), id: "gallery.mock.open" },
    openStates: { ...view("openStates"), id: "gallery.mock.openStates" },
    openTints: tintsView,
  },
  entries: [
    { id: "open.view", label: "1. Open (Ctrl+Alt+O): project cards and recent files", view: "open" },
    { id: "open.cardStates", label: "2. Project card: on GitHub, local only, still counting, empty (5 November)", view: "openStates" },
    { id: "open.shimmerTints", label: "3. Loading shimmer on project tints: light, dark and contrast (D-353)", view: "openTints" },
  ] as Entry[],
};