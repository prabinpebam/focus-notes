/**
 * Two-column dialogs, area C (D-408): the app's own share, rewrite and GitHub dialogs over fake data, so the
 * trailing actions (secondary first, primary last) can be reviewed in the gallery. Actions are left out here.
 */
import shareItem from "../../views/shareItem.view.json" with { type: "json" };
import rewrite from "../../views/rewrite.view.json" with { type: "json" };
import projects from "../../views/projects.view.json" with { type: "json" };
import data from "./data.json" with { type: "json" };
import { compose } from "../../src/compose.ts";

type Entry = { id: string; label: string; view: string; local?: Record<string, string | number | boolean> };
type Node = { root: { children: unknown[] } };

const mockOf = (node: unknown, from: string, to: string): unknown => {
  if (Array.isArray(node)) return node.map((n) => mockOf(n, from, to));
  if (!node || typeof node !== "object") return typeof node === "string" ? node.replace(new RegExp(`^vm\\.${from}\\b`), `vm.${to}`) : node;
  return Object.fromEntries(Object.entries(node).filter(([k]) => k !== "on").map(([k, v]) => [k === "bind" ? "get" : k, mockOf(v, from, to)]));
};
const dialogOf = (doc: Node, index: number, from: string, to: string, focus: string) => ({ focus, root: { type: "Stack", id: "dialogsC", children: [mockOf(doc.root.children[index], from, to)] } });

export const dialogsCMocks = {
  id: "dialogsC",
  label: "Mocks: two-column dialogs, sharing, projects and rewrite (D-408)",
  models: {
    dcShare: data.share,
    dcShareDeleted: { ...data.share, deleted: true, primaryLabel: "Share", actionsDisabled: true, actionReason: "The folder was deleted" },
    dcProjects: data.projects,
    dcRewrite: { confirmingDiscard: true },
  },
  views: {
    share: dialogOf(shareItem as unknown as Node, 0, "shareItem", "dcShare", "shareItemLink"),
    shareDeleted: dialogOf(shareItem as unknown as Node, 0, "shareItem", "dcShareDeleted", "shareItemLink"),
    github: dialogOf(compose(projects) as unknown as Node, 1, "projects", "dcProjects", "dialogsC"),
    rewriteLoss: dialogOf(rewrite as unknown as Node, 1, "rewrite", "dcRewrite", "rewritePromptLoss"),
  },
  entries: [
    { id: "dialogsC.share", label: "Share dialog: actions trailing, Share last", view: "share" },
    { id: "dialogsC.shareDeleted", label: "Share dialog: the item was deleted (Close sharing, Restore in Files)", view: "shareDeleted" },
    { id: "dialogsC.github", label: "Open from GitHub: Back at the trailing edge", view: "github" },
    { id: "dialogsC.rewriteLoss", label: "Rewrite: discard the prompt? (Discard, Keep last)", view: "rewriteLoss" },
  ] as Entry[],
};
