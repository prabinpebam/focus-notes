/**
 * D-436 (owner, 27 November 10:35): a published file's live status in Files. The desktop checks each page change on
 * GitHub Pages (Publish, Unpublish, an update) and reports every change of the list; it lands in `ui.share.live`,
 * which the Files rows and Opened files tabs paint on the globe badge (`siteMarksOf`). While anything waits, one quiet
 * tracked wait runs (`sharing.liveStatus`, never an outcome toast). A note that doesn't go live says so once, as an
 * auto-dismiss notification with Retry; the file's menu offers Retry publish and View on GitHub while it's failed.
 */
import type { AppState } from "./app.ts";
import type { CommandRegistry } from "./commands.ts";
import type { MessageCatalog } from "./messages.ts";
import type { NotificationOptions } from "./notifications.ts";
import type { Store } from "./store.ts";
import type { TaskTracker } from "./tasks.ts";
import { LIVE_REASONS } from "./share-details.ts";
import { liveStatusOf, type LiveStatus } from "./publish-status.ts";
import { findNode, joinPath, stemOf } from "./workspace.ts";

export interface LiveStatusBridge {
  /** The statuses now (after a launch, the checks the last run left pending resume). */
  liveStatus(): Promise<LiveStatus[]>;
  onLiveStatus(listener: (entries: LiveStatus[]) => void): () => void;
  /** Builds and publishes the site again and checks the note from now. */
  liveRetry(root: LiveStatus["root"], path: string): Promise<void>;
  /** Opens the site repository's Pages runs on github.com. */
  liveOpenGitHub(): Promise<void>;
}

export const LIVE_RETRY = "files.liveRetry";
export const LIVE_GITHUB = "files.liveGitHub";

export function registerPublishLive(ctx: {
  store: Store<AppState>; commands: CommandRegistry<AppState>; catalog: MessageCatalog; tracker: TaskTracker;
  bridge?: Partial<LiveStatusBridge>; toast: (message: string, opts?: NotificationOptions) => unknown;
}): void {
  const { store, commands, catalog, tracker, bridge } = ctx;
  let waiting: (() => void) | undefined;
  const keyOf = (e: LiveStatus) => `${e.root}:${e.path}`;
  const apply = (entries: LiveStatus[]) => {
    const before = new Map((store.state.ui.share.live ?? []).map(e => [keyOf(e), e]));
    store.update(s => ({ ...s, ui: { ...s.ui, share: { ...s.ui.share, live: entries } } }));
    const pending = entries.some(e => e.state === "pending");
    // One quiet wait while anything is checked (the wait inventory's `sharing.liveStatus`).
    if (pending && !waiting) {
      void tracker.run("sharing.liveStatus", "files.live.pending", () => new Promise<void>(resolve => { waiting = resolve; }), undefined, "fn:sharing.liveStatus", "none").catch(() => {});
    } else if (!pending && waiting) { waiting(); waiting = undefined; }
    for (const e of entries) {
      if (e.state !== "failed" || before.get(keyOf(e))?.state === "failed") continue;
      const root = store.state.workspace.tree.roots.find(r => r.id === e.root);
      const node = root ? findNode(store.state.workspace.tree, e.path.split("/").reduce(joinPath, root.path))?.node : undefined;
      const title = (node?.kind === "note" ? node.title : undefined) || stemOf(e.path.split("/").at(-1) ?? e.path);
      const reason = catalog.format(`files.live.reason.${LIVE_REASONS.includes(e.reason ?? "") ? e.reason : "failed"}`);
      ctx.toast(catalog.format("files.live.notLive", { title, reason }), { tone: "error", action: { command: LIVE_RETRY, label: catalog.format("command.files.liveRetry"), args: { root: e.root, path: e.path } } });
    }
  };
  if (bridge?.liveStatus && bridge.onLiveStatus) {
    bridge.onLiveStatus(apply);
    void bridge.liveStatus().then(apply, () => {});
  }
  /** The file the menu acts on: the Files focus while the panel's open, else the open note. */
  const target = (s: AppState) => {
    const path = s.ui.files.open ? s.ui.files.selection.focus : s.note.path;
    return path && findNode(s.workspace.tree, path) ? liveStatusOf(s.workspace.tree, path, s.ui.share.live) : undefined;
  };
  const failed = (s: AppState) => target(s)?.state === "failed";
  commands.register<{ root?: LiveStatus["root"]; path?: string }>({
    id: LIVE_RETRY, title: "command.files.liveRetry", group: "files",
    enabled: (s) => Boolean(bridge?.liveRetry) && failed(s),
    run: async (args) => {
      const e = args?.root && args.path ? { root: args.root, path: args.path } : target(store.state);
      if (e) await bridge!.liveRetry!(e.root, e.path);
    },
  });
  commands.register({
    id: LIVE_GITHUB, title: "command.files.liveGitHub", group: "files",
    enabled: (s) => Boolean(bridge?.liveOpenGitHub) && failed(s),
    run: async () => { await bridge!.liveOpenGitHub!(); },
  });
}
