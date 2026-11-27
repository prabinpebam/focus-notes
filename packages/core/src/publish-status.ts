/**
 * A note's place on the paired public site (D-422): Live, Publishing… or Not published yet. Derived
 * only from the site's published set and the Publish in flight, both kept in `ui.share.publication`.
 */
import { rootOf, type WorkspaceTree } from "./workspace.ts";

export type PublishStatus = "live" | "publishing" | "unpublished";
/** Notes relative to the private notes root: on the current site, and in the Publish that's running. */
export interface SitePublication { published: readonly string[]; publishing: readonly string[] }
export const NO_PUBLICATION: SitePublication = { published: [], publishing: [] };
/** The open note's status line in ⋯ and File, and its title while there's no status to show (then it's left out of every menu). */
export const PUBLISH_STATUS_COMMAND = "note.publishStatus";
export const PUBLISH_STATUS_TITLE = "command.note.publishStatus";

/** A tree path relative to its private notes root, or undefined outside one (only private notes publish, G3). */
export function publishPathOf(tree: WorkspaceTree, path: string | undefined): string | undefined {
  if (!path) return undefined;
  const root = rootOf(tree, path);
  return root?.id === "private" ? path.slice(root.path.length).split(/[\\/]/).filter(Boolean).join("/") || undefined : undefined;
}

/** The status of one note; undefined for anything that can't be published. A running Publish wins over the old set. */
export function publishStatus(rel: string | undefined, site: SitePublication): PublishStatus | undefined {
  if (!rel) return undefined;
  if (site.publishing.includes(rel)) return "publishing";
  return site.published.includes(rel) ? "live" : "unpublished";
}

/**
 * D-436: a published file's page change as the desktop checks it on GitHub Pages: `pending` until the page answers
 * with a build made after the change (or 404 for Unpublish), `live` for the moment it does, `failed` with its reason
 * (`timeout`, `pages`, `offline`, …). `root` and `path` place it: the notes root and the path in it.
 */
export interface LiveStatus { root: "private" | "public"; path: string; url: string; action: "publish" | "unpublish"; state: "pending" | "live" | "failed"; reason?: string }

/** A tree path's live status, if it has one. */
export function liveStatusOf(tree: WorkspaceTree, path: string, live: readonly LiveStatus[] | undefined): LiveStatus | undefined {
  if (!live?.length) return undefined;
  const root = rootOf(tree, path);
  if (!root || (root.id !== "private" && root.id !== "public")) return undefined;
  const rel = path.slice(root.path.length).split(/[\\/]/).filter(Boolean).join("/");
  return live.find(l => l.root === root.id && l.path === rel);
}
