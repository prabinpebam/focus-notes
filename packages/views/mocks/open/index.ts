/**
 * The Open view redesign (owner, 4 November; strict design, not wired): the app's own Open view
 * document over fake data, so the mock and the built screen are the same document. Its actions are
 * left out here. Spec: documentations/experience/projects.md (Open).
 *
 * The project card's GitHub line and size line (owner, 5 November; D-346, PRJ-20 to PRJ-22) are
 * added to the real card here, until the owner approves them and they move into open-body.json.
 */
import projects from "../../views/projects.view.json" with { type: "json" };
import data from "./data.json" with { type: "json" };
import states from "./states.json" with { type: "json" };
import { compose } from "../../src/compose.ts";

type Entry = { id: string; label: string; view: string; local?: Record<string, string | number | boolean> };
type Node = Record<string, unknown>;

const mockOf = (node: unknown, model: string): unknown => {
  if (Array.isArray(node)) return node.map((n) => mockOf(n, model));
  if (!node || typeof node !== "object") return typeof node === "string" ? node.replace(/^vm\.projects\b/, `vm.${model}`) : node;
  return Object.fromEntries(Object.entries(node).filter(([k]) => k !== "on").map(([k, v]) => [k === "bind" ? "get" : k, mockOf(v, model)]));
};

// The new card props, read from each entry (in the wired app, from vm.projects.entries).
const cardProps = {
  repo: { get: "entry.repo" },
  repoLabel: { t: "project.open.repo", args: { repo: { get: "entry.repo" } } },
  stats: { t: "project.open.stats", args: { size: { get: "entry.size" }, files: { get: "entry.files" }, media: { get: "entry.media" }, folders: { get: "entry.folders" } } },
  statsBusy: { get: "entry.statsBusy" },
};
const withCard = (node: unknown): unknown => {
  if (Array.isArray(node)) return node.map(withCard);
  if (!node || typeof node !== "object") return node;
  const n = Object.fromEntries(Object.entries(node).map(([k, v]) => [k, withCard(v)])) as Node;
  const props = n.props as Node | undefined;
  return n.type === "OpenItem" && props?.kind === "project" ? { ...n, props: { ...props, ...cardProps } } : n;
};
const view = (model: string) => withCard(mockOf(compose(projects), model)) as Node;

export const openMocks = {
  id: "open",
  label: "Mocks: Open (4 and 5 November)",
  models: { openMock: data, openStates: { ...data, entries: states.entries } },
  views: {
    open: { ...view("openMock"), id: "gallery.mock.open" },
    openStates: { ...view("openStates"), id: "gallery.mock.openStates" },
  },
  entries: [
    { id: "open.view", label: "1. Open (Ctrl+Alt+O): project cards and recent files", view: "open" },
    { id: "open.cardStates", label: "2. Project card: on GitHub, local only, still counting (5 November)", view: "openStates" },
  ] as Entry[],
};
