/**
 * Share details… (D-431): one shared file's live shares in a dialog of their own, opened from the file's
 * right-click menu in Files and from ⋯ More. Its rows are the ones Settings → Sharing listed (Copy, Extend,
 * Withdraw), run by the same `sharing.*` commands; only shared files offer it. Also the Files panel's marks:
 * which files are shared, which are published (D-422's live mark), and both.
 */
import { audienceState, type Audience } from "@focus-notes/seal/access";
import type { AppState } from "./app.ts";
import type { CommandRegistry } from "./commands.ts";
import type { MessageCatalog } from "./messages.ts";
import type { Store } from "./store.ts";
import type { ViewModelRegistry } from "./view-models.ts";
import type { TaskTracker } from "./tasks.ts";
import type { AccessBridge } from "./share-manage.ts";
import { liveStatusOf, publishPathOf, publishStatus } from "./publish-status.ts";
import { publicLinkOf } from "./public-link-app.ts";
import { publicNoteUrl } from "./public-page.ts";
import { middleTruncate, readableLink } from "./readable-link.ts";
import { findNode, rootOf, stemOf, type TreeNode, type WorkspaceTree } from "./workspace.ts";

export const SHARE_DETAILS_COMMAND = "note.shareDetails";
const EXPIRIES = ["7d", "30d", "90d", "never"] as const;

/** A tree path relative to its private notes root, as access.json names shared items. */
function sharedPathOf(tree: WorkspaceTree, path: string): string | undefined {
  const root = rootOf(tree, path);
  return root?.id === "private" ? path.slice(root.path.length).split(/[\\/]/).filter(Boolean).join("/") || undefined : undefined;
}
/** Every note in a private folder, as paths relative to the private notes root. */
function notesUnder(tree: WorkspaceTree, path: string): string[] {
  const root = rootOf(tree, path), found = findNode(tree, path);
  if (!root || found?.node.kind !== "folder") return [];
  const out: string[] = [];
  const walk = (nodes: readonly TreeNode[], prefix: string) => {
    for (const n of nodes) n.kind === "folder" ? walk(n.children, `${prefix}${n.name}/`) : out.push(`${prefix}${n.name}`);
  };
  walk(found.node.children, `${sharedPathOf(tree, path)}/`);
  return out;
}
const live = (g: Audience) => ["active", "soon"].includes(audienceState(g));

/** The item's shares that still work: shared as this note or folder itself, not withdrawn or expired. */
export function liveSharesOf(state: Pick<AppState, "workspace" | "ui">, path: string): Audience[] {
  const rel = sharedPathOf(state.workspace.tree, path);
  if (!rel) return [];
  return (state.ui.share.listing?.grants ?? []).filter((g) => g.item?.path === rel && live(g));
}

/**
 * A Files row's marks (D-431): shared, published (live on the site, D-422), or both, with one name for them
 * (`siteLabel`, read after the file's name) and, in plain words, what each means (`siteDescription`: the
 * row's accessible description): who can open it and until when, and the badge's tooltip unless `siteTooltip` says
 * it on one line. A published page's link reads as a person reads it (readableLink: no https://, spaces not %20):
 * whole in the description, cut in the middle when long in `siteTooltip`. Copy and open keep the encoded URL.
 */
export function siteMarksOf(state: Pick<AppState, "workspace" | "ui">, path: string, catalog: MessageCatalog): { shared?: boolean; published?: boolean; siteLabel?: string; siteDescription?: string; siteTooltip?: string; siteLive?: "pending" | "confirmed" | "failed" } {
  const shares = liveSharesOf(state, path);
  const shared = shares.length > 0;
  const tree = state.workspace.tree;
  const root = rootOf(tree, path);
  const isNote = findNode(tree, path)?.node.kind === "note";
  // D-436: what the desktop is checking on GitHub Pages for this file right now, if anything.
  const check = liveStatusOf(tree, path, state.ui.share.live);
  // Only notes on the site get the globe: a Private + Public project's public notes (main, 27 November 10:49), or a
  // private-only project's published notes; a private note in a Private + Public project never does, unless it's
  // still on the site while its Unpublish waits for Pages.
  const twoRoots = tree.roots.some((r) => r.id === "public");
  const settled = isNote && (root?.id === "public" || (root?.id === "private" && !twoRoots
    && publishStatus(publishPathOf(tree, path), state.ui.share.publication) === "live"));
  const published = Boolean(check) || settled;
  if (!shared && !published) return {};
  const linkOnly = shares.some((g) => g.link && !g.passcode), codeOnly = shares.some((g) => g.passcode && !g.link);
  const ways = linkOnly && codeOnly ? "either" : linkOnly ? "link" : codeOnly ? "code" : "both";
  // The last day any of its shares opens; none when one never expires.
  const last = shares.some((g) => !g.expiresAt) ? undefined : shares.map((g) => Date.parse(g.expiresAt!)).filter(Number.isFinite).sort((a, b) => b - a)[0];
  const sharedAbout = !shared ? "" : last === undefined ? catalog.format("files.mark.sharedAbout", { ways })
    : catalog.format("files.mark.sharedAboutUntil", { ways, date: new Intl.DateTimeFormat(catalog.locale, { day: "numeric", month: "short" }).format(new Date(last)) });
  const link = check?.url ?? publishedLinkOf(state, path);
  const publishedAbout = !published ? ""
    : check?.state === "pending" ? catalog.format(check.action === "unpublish" ? "files.live.unpublishing" : "files.live.pending")
      : check?.state === "failed" ? catalog.format("files.live.failed", { reason: catalog.format(`files.live.reason.${LIVE_REASONS.includes(check.reason ?? "") ? check.reason : "failed"}`) })
        : check?.action === "unpublish" ? catalog.format("files.live.unpublished")
          : link ? catalog.format("files.live.published", { link: readableLink(link) }) : catalog.format("files.mark.publishedAbout");
  // Live and not shared: the tooltip is this one line, its link whole when it fits, else cut in the middle.
  const liveLink = link && published && !shared && (!check || (check.state === "live" && check.action !== "unpublish")) ? link : undefined;
  // The name after the file's name: left out where the row already says it (a public note's *public*, or D-422's
  // *publishing…* while its Publish runs), so it's never read twice.
  const quiet = !shared && ((settled && root?.id === "public" && !check)
    || (check?.state === "pending" && publishStatus(publishPathOf(tree, path), state.ui.share.publication) === "publishing"));
  return {
    shared, published,
    ...(quiet ? {} : { siteLabel: catalog.format(shared && published ? "files.mark.both" : shared ? "files.mark.shared" : "files.mark.published") }),
    siteDescription: shared && published ? catalog.format("files.mark.bothAbout", { shared: sharedAbout, published: publishedAbout }) : sharedAbout || publishedAbout,
    ...(liveLink ? { siteTooltip: catalog.format("files.live.published", { link: middleTruncate(readableLink(liveLink)) }) } : {}),
    ...(check ? { siteLive: check.state === "live" ? "confirmed" as const : check.state } : {}),
  };
}
/** The reasons a page didn't go live that have their own words (D-436); any other is `failed`. */
export const LIVE_REASONS = ["timeout", "pages", "offline", "signedout", "refused", "leak", "failed"];
/** A published note's page address: a public note's on the project's site, or a private-only project's published note's. */
function publishedLinkOf(state: Pick<AppState, "workspace" | "ui">, path: string): string | undefined {
  const tree = state.workspace.tree;
  const root = rootOf(tree, path);
  if (root?.id === "public") return publicLinkOf(tree, state.workspace.site, path);
  const rel = publishPathOf(tree, path), site = state.ui.share.listing?.site;
  return rel && site ? publicNoteUrl(site, rel) : undefined;
}

export function registerShareDetails({ store, catalog, commands, viewModels, tracker, access, flush }: {
  store: Store<AppState>; catalog: MessageCatalog; commands: CommandRegistry<AppState>; viewModels: ViewModelRegistry<AppState>;
  tracker: Pick<TaskTracker, "run">; access: AccessBridge | undefined; flush: () => Promise<boolean>;
}) {
  const setDetails = (details: AppState["ui"]["share"]["details"]) => store.update((s) => ({ ...s, ui: { ...s.ui, share: { ...s.ui.share, details } } }));
  const patch = (p: Partial<AppState["ui"]["share"]["details"]>) => setDetails({ ...store.state.ui.share.details, ...p });
  const open = async (path: string | undefined) => {
    if (!path || !liveSharesOf(store.state, path).length) return;
    // A copy or change made earlier in Settings says nothing here.
    store.update((s) => ({ ...s, ui: { ...s.ui, toolbarOpen: false, files: { ...s.ui.files, open: s.ui.files.pinned }, share: { ...s.ui.share, details: { open: true, path, busy: false, status: "", problem: "" }, settings: { ...s.ui.share.settings, status: "", problem: "", problemRow: "" } } } }));
    // The rows show at once from what's known; a fresh read adds newer notes a folder's shares don't have yet.
    const listing = await access?.load().catch(() => undefined);
    if (listing && store.state.ui.share.details.open) store.update((s) => ({ ...s, ui: { ...s.ui, share: { ...s.ui.share, listing } } }));
  };
  commands.register<{ path?: string }>({
    id: "share.details.open", title: "command.note.shareDetails",
    run: ({ path } = {}) => open(path ?? store.state.note.path),
  });
  commands.register<{ open: boolean }>({
    id: "share.details.setOpen", title: "command.note.shareDetails",
    run: ({ open: next }) => { if (!next && !store.state.ui.share.settings.busy && !store.state.ui.share.details.busy) setDetails({ open: false, path: "" }); },
  });
  // A folder share's newer notes (not in its snapshot) join it, then the website is updated (SHR-24).
  commands.register<{ id: string }>({
    id: "share.details.addThem", title: "command.note.shareDetails",
    run: async ({ id }) => {
      const d = store.state.ui.share.details;
      const g = liveSharesOf(store.state, d.path).find((x) => x.id === id);
      if (!d.open || d.busy || !g?.unsharedNotes?.length || !access?.ready) return;
      patch({ busy: true, pending: id, status: catalog.format("share.item.adding"), problem: "" });
      store.update((s) => ({ ...s, ui: { ...s.ui, share: { ...s.ui.share, settings: { ...s.ui.share.settings, status: "", problem: "", problemRow: "" } } } }));
      try {
        if (!(await flush())) throw new Error("access:save.failed");
        // The shell checks the folder's whole current contents, as reviewed here (scope.changed otherwise).
        const notes = notesUnder(store.state.workspace.tree, d.path);
        const listing = await tracker.run("share.item.addNotes", "share.item.adding", () => access.apply({ op: "addItemNotes", id, notes }));
        const { id: _, ...saved } = listing;
        store.update((s) => ({ ...s, ui: { ...s.ui, share: { ...s.ui.share, listing: saved } } }));
        await tracker.run("share.item.publish", "share.item.publishing", () => access.ready!(id));
        patch({ status: catalog.format("share.item.added") });
      } catch {
        patch({ status: "", problem: catalog.format("share.item.failed") });
      } finally { patch({ busy: false, pending: "" }); }
    },
  });
  commands.register({
    id: SHARE_DETAILS_COMMAND, title: "command.note.shareDetails", icon: "share",
    enabled: (s) => Boolean(s.note.path && liveSharesOf(s, s.note.path).length),
    disabledReason: "command.note.shareDetails.reason",
    run: () => open(store.state.note.path),
  });

  const str = { type: "string" as const }, bool = { type: "boolean" as const };
  const menuSchema = { type: "array" as const, items: { type: "object" as const, properties: {
    id: str, items: { type: "array" as const, items: { type: "object" as const, properties: { id: str, label: str } } },
  } } };
  viewModels.register({
    id: "vm.shareDetails",
    schema: { type: "object", properties: {
      open: bool, name: str, busy: bool, status: str, hasStatus: bool, problem: str, hasProblem: bool, copyLabel: str, extendLabel: str,
      rows: { type: "array", items: { type: "object", properties: { id: str, methods: str, detail: str, badge: str, newer: str, hasNewer: bool, copyMenu: menuSchema, extendMenu: menuSchema,
        copyBusy: bool, extendBusy: bool, withdrawBusy: bool, addBusy: bool } } },
    } },
    reads: ["ui.share.details", "ui.share.listing", "ui.share.settings", "workspace.tree"],
    select: (s) => {
      const d = s.ui.share.details, m = s.ui.share.settings;
      // The withdraw confirmation takes its place while it's open, then it comes back.
      const shown = d.open && !["withdraw", "delete"].includes(m.dialog);
      const node = d.path ? findNode(s.workspace.tree, d.path)?.node : undefined;
      const menu = (ids: readonly string[], prefix: string) => [{ id: "actions", items: ids.map((id) => ({ id, label: catalog.format(`${prefix}.${id}`) })) }];
      const rows = d.open ? liveSharesOf(s, d.path).map((g) => {
        const date = g.expiresAt ? new Intl.DateTimeFormat(catalog.locale, { day: "numeric", month: "short" }).format(new Date(g.expiresAt)) : "";
        return {
          id: g.id,
          // New shares open by link or access code; an older named share keeps its name-and-passcode words.
          methods: catalog.format(`${g.shareCode ? "share.details.ways" : "share.manage.ways"}.${g.link && g.passcode ? "both" : g.link ? "link" : g.shareCode ? "accessCode" : "passcode"}`),
          detail: date ? catalog.format("sharing.expires", { date }) : catalog.format("share.manage.expiry.badge.never"),
          badge: catalog.format(`sharing.state.${audienceState(g)}`),
          newer: g.unsharedNotes?.length ? catalog.format("share.dialog.newer", { count: g.unsharedNotes.length }) : "", hasNewer: Boolean(g.unsharedNotes?.length),
          copyMenu: menu([...(g.link ? ["link"] : []), ...(g.passcode ? ["accessCode"] : []), "information"], "sharing.copy"),
          extendMenu: menu(EXPIRIES, "share.manage.expiry"),
          // D-356: only the pressed control shows pending; the row's other actions stay at rest.
          copyBusy: m.busy && m.pending === `${g.id}:copy`, extendBusy: m.busy && m.pending === `${g.id}:extend`,
          withdrawBusy: m.busy && m.pending === `${g.id}:withdraw`, addBusy: Boolean(d.busy) && d.pending === g.id,
        };
      }) : [];
      // The latest outcome: a Copy, Extend or Withdraw (Settings' state, cleared by Add them) or Add them's own.
      const status = !d.open ? "" : m.status ? catalog.format("share.settings.status", { status: m.status }) : d.status ?? "";
      const problem = !d.open ? "" : (m.problemRow ? catalog.format("share.template.copyProblem") : m.problem) || (d.problem ?? "");
      return {
        open: shown, name: node ? node.kind === "note" ? node.title || stemOf(node.name) : node.name : "",
        busy: m.busy || Boolean(d.busy), status, hasStatus: Boolean(status), problem, hasProblem: Boolean(problem),
        copyLabel: catalog.format("shareDetails.copy"), extendLabel: catalog.format("share.settings.extend"), rows,
      };
    },
  });
}
