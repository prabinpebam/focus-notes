/**
 * Views that share a part: `{ "use": "<part>" }` in a view document is replaced by that part's JSON when
 * the views load, so the Open dialog, the full-window Open and its gallery mock are one document
 * (owner, 4 November: a built screen must match its approved mock).
 */
import openBody from "../views/open-body.json" with { type: "json" };
import sharingProgress from "../views/sharing-progress.json" with { type: "json" };
import projectDelete from "../views/project-delete.json" with { type: "json" };

const PARTS: Record<string, unknown> = { "open.body": openBody, "sharing.progress": sharingProgress, "project.delete": projectDelete };

export function compose<T>(node: T): T {
  if (Array.isArray(node)) return node.map(compose) as T;
  if (!node || typeof node !== "object") return node;
  const use = (node as { use?: unknown }).use;
  if (typeof use === "string" && use in PARTS && Object.keys(node).length === 1) return compose(PARTS[use]) as T;
  return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, compose(v)])) as T;
}
