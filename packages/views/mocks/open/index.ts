/**
 * The Open view redesign (owner, 4 November; strict design, not wired): the app's own Open view
 * document over fake data, so the mock and the built screen are the same document. Its actions are
 * left out here. Spec: documentations/experience/projects.md (Open).
 */
import projects from "../../views/projects.view.json" with { type: "json" };
import data from "./data.json" with { type: "json" };

type Entry = { id: string; label: string; view: string; local?: Record<string, string | number | boolean> };

const mockOf = (node: unknown): unknown => {
  if (Array.isArray(node)) return node.map(mockOf);
  if (!node || typeof node !== "object") return typeof node === "string" ? node.replace(/^vm\.projects\b/, "vm.openMock") : node;
  return Object.fromEntries(Object.entries(node).filter(([k]) => k !== "on").map(([k, v]) => [k === "bind" ? "get" : k, mockOf(v)]));
};
const open = mockOf(projects) as Record<string, unknown>;

export const openMocks = {
  id: "open",
  label: "Mocks: Open (4 November)",
  models: { openMock: data },
  views: { open: { ...open, id: "gallery.mock.open" } },
  entries: [
    { id: "open.view", label: "1. Open (Ctrl+Alt+O): project cards and recent files", view: "open" },
  ] as Entry[],
};
