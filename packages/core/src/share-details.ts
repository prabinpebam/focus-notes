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
import { publishPathOf, publishStatus } from "./publish-status.ts";
import { findNode, rootOf, stemOf, type WorkspaceTree } from "./workspace.ts";

export const SHARE_DETAILS_COMMAND = "note.shareDetails";
const EXPIRIES = ["7d", "30d", "90d", "never"] as const;

/** A tree path relative to its private notes root, as access.json names shared items. */
function sharedPathOf(tree: WorkspaceTree, path: string): string | undefined {
  const root = rootOf(tree, path);
  return root?.id === "private" ? path.slice(root.path.length).split(/[\\/]/).filter(Boolean).join("/") || undefined : undefined;
}
const live = (g: Audience) => ["active", "soon"].includes(audienceState(g));

/** The item's shares that still work: shared as this note or folder itself, not withdrawn or expired. */
export function liveSharesOf(state: Pick<AppState, "workspace" | "ui">, path: string): Audience[] {
  const rel = sharedPathOf(state.workspace.tree, path);
  if (!rel) return [];
  return (state.ui.share.listing?.grants ?? []).filter((g) => g.item?.path === rel && live(g));
}

/** A Files row's marks (D-431): shared, published (live on the site, D-422), or both, with one name for them. */
export function siteMarksOf(state: Pick<AppState, "workspace" | "ui">, path: string, catalog: MessageCatalog): { shared?: boolean; published?: boolean; siteLabel?: string } {
  const shared = liveSharesOf(state, path).length > 0;
  const published = publishStatus(publishPathOf(state.workspace.tree, path), state.ui.share.publication) === "live";
  if (!shared && !published) return {};
  return { shared, published, siteLabel: catalog.format(shared && published ? "files.mark.both" : shared ? "files.mark.shared" : "files.mark.published") };
}

export function registerShareDetails({ store, catalog, commands, viewModels }: {
  store: Store<AppState>; catalog: MessageCatalog; commands: CommandRegistry<AppState>; viewModels: ViewModelRegistry<AppState>;
}) {
  const setDetails = (details: AppState["ui"]["share"]["details"]) => store.update((s) => ({ ...s, ui: { ...s.ui, share: { ...s.ui.share, details } } }));
  const open = async (path: string | undefined) => {
    if (!path || !liveSharesOf(store.state, path).length) return;
    // A copy or change made earlier in Settings says nothing here.
    store.update((s) => ({ ...s, ui: { ...s.ui, toolbarOpen: false, files: { ...s.ui.files, open: s.ui.files.pinned }, share: { ...s.ui.share, details: { open: true, path }, settings: { ...s.ui.share.settings, status: "", problem: "", problemRow: "" } } } }));
  };
  commands.register<{ path?: string }>({
    id: "share.details.open", title: "command.note.shareDetails",
    run: ({ path } = {}) => open(path ?? store.state.note.path),
  });
  commands.register<{ open: boolean }>({
    id: "share.details.setOpen", title: "command.note.shareDetails",
    run: ({ open: next }) => { if (!next && !store.state.ui.share.settings.busy) setDetails({ open: false, path: "" }); },
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
      rows: { type: "array", items: { type: "object", properties: { id: str, methods: str, detail: str, badge: str, copyMenu: menuSchema, extendMenu: menuSchema } } },
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
          methods: catalog.format(`share.manage.ways.${g.link && g.passcode ? "both" : g.link ? "link" : "passcode"}`),
          detail: date ? catalog.format("sharing.expires", { date }) : catalog.format("share.manage.expiry.badge.never"),
          badge: catalog.format(`sharing.state.${audienceState(g)}`),
          copyMenu: menu([...(g.link ? ["link"] : []), ...(g.passcode ? ["accessCode"] : []), "information"], "sharing.copy"),
          extendMenu: menu(EXPIRIES, "share.manage.expiry"),
        };
      }) : [];
      const status = d.open && m.status ? catalog.format("share.settings.status", { status: m.status }) : "";
      const problem = d.open ? m.problemRow ? catalog.format("share.template.copyProblem") : m.problem : "";
      return {
        open: shown, name: node ? node.kind === "note" ? node.title || stemOf(node.name) : node.name : "",
        busy: m.busy, status, hasStatus: Boolean(status), problem, hasProblem: Boolean(problem),
        copyLabel: catalog.format("shareDetails.copy"), extendLabel: catalog.format("share.settings.extend"), rows,
      };
    },
  });
}
