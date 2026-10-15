/**
 * Settings → Sharing (WP-5.3, SHR-05, SHR-07, SHR-08, SHR-09, D-134): the owner's audiences, made,
 * changed, withdrawn, and deleted without editing `private/access.json` by hand. The shell owns the
 * file (`bridge.access`): it makes every secret, checks each change with the publisher's own rules,
 * writes it, and commits it like a note, so it's live after the next backup and publish. This module
 * keeps the dialogs' state, explains problems before asking, and builds the invite.
 */
import {
  audienceState, DEFAULT_EXPIRY, EXPIRY_CHOICES, expiryFrom, nameProblem, passcodeProblem, shareGrants,
  type AccessChange, type AccessProblem, type ExpiryChoice,
} from "@focus-notes/seal/access";
import { shareLink, type AccessFile, type Grant } from "@focus-notes/seal";
import type { CommandRegistry } from "./commands.ts";
import type { MessageCatalog } from "./messages.ts";
import type { Store } from "./store.ts";
import type { ViewModelRegistry } from "./view-models.ts";
import type { TreeNode, WorkspaceTree } from "./workspace.ts";

/** What the shell reports: whether there's a private repository, the site, and the share audiences with their secrets. */
export interface AccessListing {
  available: boolean;
  /** The Pages site's address, once publishing is set up. Links need it. */
  site?: string;
  /** Whether the owner's vault grant is in force (it's never sent here). */
  vault: boolean;
  grants: Grant[];
}
/** The desktop's access.json (D-134). Absent in the browser. */
export interface AccessBridge {
  load(): Promise<AccessListing>;
  /** Makes one change and commits it. Rejects with a message containing `access:<problem>` when it can't. */
  apply(change: AccessChange): Promise<AccessListing & { id: string }>;
  /** Four fresh EFF words (SHR-07). */
  suggestPasscode(): Promise<string>;
}

// ---- the invite (SHR-09) ----

export type InviteValues = Partial<Record<"name" | "title" | "link" | "passcode" | "expires" | "site", string>>;
const PLACEHOLDERS = ["name", "title", "link", "passcode", "expires", "site"] as const;

/**
 * The invite: the template with its placeholders filled in. A line that uses a placeholder with no
 * value (a link for a passcode-only audience, an expiry for one that never expires) is left out.
 */
export function inviteText(template: string, values: InviteValues): string {
  return template.split(/\r?\n/)
    .filter((line) => PLACEHOLDERS.every((p) => !line.includes(`{${p}}`) || values[p]))
    .map((line) => line.replace(/\{(name|title|link|passcode|expires|site)\}/g, (_, p: keyof InviteValues) => values[p]!))
    .join("\n").trim();
}

/** The default template, from the catalog: the shared-computer line only for audiences with both ways in (D-125 (1)). */
export function inviteTemplate(catalog: MessageCatalog, both: boolean): string {
  const raw = Object.fromEntries(PLACEHOLDERS.map((p) => [p, `{${p}}`]));
  return ["hi", "link", "passcode", ...(both ? ["sharedComputer"] : []), "expires"].map((k) => catalog.format(`share.manage.invite.${k}`, raw)).join("\n");
}

/** One or two letters for an audience's card. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/u).filter(Boolean);
  const first = (w: string) => [...w][0] ?? "";
  return (words.length > 1 ? first(words[0]!) + first(words.at(-1)!) : [...(words[0] ?? "")].slice(0, 2).join("")).toLocaleUpperCase();
}

// ---- what can be shared: the private root's notes and folders ----

export interface Shareable { kind: "note" | "folder"; path: string; label: string }
/** The private notes and folders, paths relative to `private/notes` as access.json names them. */
export function shareables(tree: WorkspaceTree): Shareable[] {
  const root = tree.roots.find((r) => r.id === "private");
  const out: Shareable[] = [];
  const walk = (nodes: readonly TreeNode[], prefix: string) => {
    for (const n of nodes) {
      const path = prefix + n.name;
      if (n.kind === "folder") { out.push({ kind: "folder", path, label: path }); walk(n.children, `${path}/`); }
      else out.push({ kind: "note", path, label: n.title || n.name.replace(/\.(md|markdown)$/i, "") });
    }
  };
  if (root) walk(root.children, "");
  return out;
}

// ---- state ----

export interface ShareEditor {
  open: boolean;
  /** Editing this audience; creating when missing. */
  id?: string;
  name: string;
  link: boolean;
  passcode: boolean;
  mode: "generate" | "own";
  generated: string;
  own: string;
  notes: string[];
  folders: string[];
  filter: string;
  /** "" keeps an edited audience's expiry. */
  expiry: ExpiryChoice | "";
  problem?: AccessProblem | "failed";
  busy: boolean;
}
export interface ShareManageState {
  listing?: AccessListing;
  loading: boolean;
  failed: boolean;
  editor: ShareEditor;
  invite: { open: boolean; id?: string; copied?: "invite" | "link" | "passcode" };
  confirm: { open: boolean; kind: "withdraw" | "delete"; id?: string; busy: boolean };
}
const EDITOR_CLOSED: ShareEditor = { open: false, name: "", link: true, passcode: true, mode: "generate", generated: "", own: "", notes: [], folders: [], filter: "", expiry: DEFAULT_EXPIRY, busy: false };
export const SHARE_MANAGE_CLOSED: ShareManageState = { loading: false, failed: false, editor: EDITOR_CLOSED, invite: { open: false }, confirm: { open: false, kind: "withdraw", busy: false } };

interface S {
  ui: { share: ShareManageState; settings: { open: boolean; section: string } };
  workspace: { tree: WorkspaceTree };
  note: { path?: string };
}
interface Ctx<St extends S> {
  store: Store<St>;
  access: AccessBridge | undefined;
  copyText: ((text: string) => Promise<void>) | undefined;
  catalog: MessageCatalog;
  commands: CommandRegistry<St>;
  viewModels: ViewModelRegistry<St>;
  now?: () => Date;
}

const problemOf = (e: unknown): AccessProblem | "failed" => (/access:([a-zA-Z.]+)/.exec(String((e as Error)?.message ?? e))?.[1] as AccessProblem | undefined) ?? "failed";
const DAY = 86_400_000;

export function registerShareManage<St extends S>({ store, access, copyText, catalog, commands, viewModels, now = () => new Date() }: Ctx<St>) {
  const st = () => store.state.ui.share;
  const set = (patch: Partial<ShareManageState>) => store.update((s) => ({ ...s, ui: { ...s.ui, share: { ...s.ui.share, ...patch } } }));
  const setEditor = (patch: Partial<ShareEditor>) => set({ editor: { ...st().editor, ...patch } });
  const grant = (id?: string) => st().listing?.grants.find((g) => g.id === id);
  const reg = <A extends Record<string, unknown> = Record<string, never>>(id: string, run: (a: A) => unknown) =>
    commands.register<A>({ id, title: `share.manage.command.${id.slice(13)}`, enabled: () => Boolean(access), run: async (a) => { await run(a); } });
  const text = (a: { value?: unknown }) => (typeof a.value === "string" ? a.value : "");
  /** Back to Settings → Sharing when a dialog it opened closes. */
  const backToSettings = () => store.update((s) => ({ ...s, ui: { ...s.ui, settings: { ...s.ui.settings, open: true, section: "sharing" } } }));
  const leaveSettings = () => store.update((s) => ({ ...s, ui: { ...s.ui, settings: { ...s.ui.settings, open: false } } }));

  reg("share.manage.load", async () => {
    if (!access) return;
    set({ loading: !st().listing, failed: false });
    const listing = await access.load().catch(() => undefined);
    set({ loading: false, failed: !listing, ...(listing ? { listing } : {}) });
  });

  // ---- the editor ----
  reg("share.manage.add", async () => {
    if (!access) return;
    const words = await access.suggestPasscode().catch(() => "");
    // This note, when it's private (Add people: "this note (checked)").
    const current = shareables(store.state.workspace.tree).find((x) => x.kind === "note" && (store.state.note.path ?? "").replace(/\\/g, "/").endsWith(`/private/notes/${x.path}`));
    leaveSettings();
    setEditor({ ...EDITOR_CLOSED, open: true, generated: words, notes: current ? [current.path] : [] });
  });
  reg<{ id: string }>("share.manage.edit", ({ id }) => {
    const g = grant(id);
    if (!g) return;
    leaveSettings();
    setEditor({
      ...EDITOR_CLOSED, open: true, id, name: g.name, link: Boolean(g.link), passcode: Boolean(g.passcode),
      generated: g.passcode?.value ?? "", notes: g.scope.notes ?? [], folders: g.scope.folders ?? [], expiry: "",
    });
  });
  reg<{ value: string }>("share.manage.setName", (a) => setEditor({ name: text(a), problem: undefined }));
  reg("share.manage.toggleLink", () => setEditor({ link: !st().editor.link, problem: undefined }));
  reg("share.manage.togglePasscode", async () => {
    const e = st().editor;
    if (!e.passcode && !e.generated && access) setEditor({ generated: await access.suggestPasscode().catch(() => "") });
    setEditor({ passcode: !st().editor.passcode, problem: undefined });
  });
  reg<{ value: string }>("share.manage.setMode", (a) => { if (a.value === "generate" || a.value === "own") setEditor({ mode: a.value, problem: undefined }); });
  reg("share.manage.newWords", async () => { if (access) setEditor({ generated: await access.suggestPasscode().catch(() => st().editor.generated) }); });
  reg<{ value: string }>("share.manage.setOwn", (a) => setEditor({ own: text(a), problem: undefined }));
  reg<{ value: string }>("share.manage.setFilter", (a) => setEditor({ filter: text(a) }));
  reg<{ id: string }>("share.manage.toggleItem", ({ id }) => {
    const e = st().editor;
    const kind = id.startsWith("f:") ? "folders" : "notes";
    const path = id.slice(2);
    const list = e[kind];
    setEditor({ [kind]: list.includes(path) ? list.filter((p) => p !== path) : [...list, path], problem: undefined });
  });
  reg<{ value: string }>("share.manage.setExpiry", (a) => { if ((EXPIRY_CHOICES as readonly string[]).includes(a.value)) setEditor({ expiry: a.value as ExpiryChoice }); });
  reg<{ open: boolean }>("share.manage.setEditorOpen", ({ open }) => {
    if (open || st().editor.busy) return;
    setEditor({ open: false });
    backToSettings();
  });

  /** What's wrong with the editor as it stands, checked as the shell will check it. */
  const editorProblem = (e: ShareEditor): AccessProblem | undefined => {
    const listing = st().listing;
    if (!e.id && listing) {
      const bad = nameProblem({ version: 1, grants: listing.grants } as AccessFile, e.name, undefined, now());
      if (bad) return bad;
    }
    if (!e.link && !e.passcode) return "waysIn.none";
    if (e.passcode && e.mode === "own") { const bad = passcodeProblem(e.own); if (bad) return bad; }
    if (!e.notes.length && !e.folders.length) return "scope.empty";
    return undefined;
  };
  reg("share.manage.submit", async () => {
    const e = st().editor;
    if (!access || e.busy) return;
    const bad = editorProblem(e);
    if (bad) return void setEditor({ problem: bad });
    const passcode = e.passcode ? (e.mode === "own" ? { value: e.own, generated: false } : { value: e.generated, generated: true }) : undefined;
    const scope = { notes: e.notes, folders: e.folders };
    const before = grant(e.id);
    const change: AccessChange = e.id
      ? {
        op: "update", id: e.id, link: e.link, scope,
        ...(e.expiry ? { expiresAt: expiryFrom(e.expiry, now()) } : {}),
        ...(!passcode ? (before?.passcode ? { passcode: null } : {}) : passcode.value !== before?.passcode?.value ? { passcode } : {}),
      }
      : { op: "create", audience: { name: e.name, link: e.link, ...(passcode ? { passcode } : {}), scope, expiresAt: expiryFrom(e.expiry || DEFAULT_EXPIRY, now()) } };
    setEditor({ busy: true, problem: undefined });
    try {
      const { id, ...listing } = await access.apply(change);
      set({ listing, editor: { ...st().editor, busy: false, open: false }, invite: { open: true, id } });
    } catch (err) {
      setEditor({ busy: false, problem: problemOf(err) });
    }
  });

  // ---- the invite ----
  const invite = (g: Grant) => {
    const site = st().listing?.site;
    const items = shareables(store.state.workspace.tree);
    const labels = [...(g.scope.notes ?? []).map((p) => items.find((x) => x.kind === "note" && x.path === p)?.label ?? p.replace(/^.*\//, "").replace(/\.(md|markdown)$/i, "")), ...(g.scope.folders ?? [])];
    const title = labels.length > 1 ? catalog.format("share.manage.scope.several", { first: labels[0]!, count: labels.length - 1 }) : labels[0] ?? "";
    const link = site && g.link ? shareLink(site, g.id, g.link.secret) : undefined;
    const expires = g.expiresAt ? new Intl.DateTimeFormat(catalog.locale, { dateStyle: "long" }).format(new Date(g.expiresAt)) : undefined;
    const values: InviteValues = { name: g.name, title, ...(link ? { link } : {}), ...(site && g.passcode ? { passcode: g.passcode.value, site: new URL("s/", site.endsWith("/") ? site : `${site}/`).href } : {}), ...(expires ? { expires } : {}) };
    return { text: inviteText(inviteTemplate(catalog, Boolean(link && values.passcode)), values), link, passcode: g.passcode?.value, title };
  };
  reg<{ id: string }>("share.manage.invite", ({ id }) => {
    if (!grant(id)) return;
    leaveSettings();
    set({ invite: { open: true, id } });
  });
  reg<{ what: string }>("share.manage.copy", async ({ what }) => {
    const g = grant(st().invite.id);
    if (!g || !copyText || (what !== "invite" && what !== "link" && what !== "passcode")) return;
    const i = invite(g);
    const value = what === "invite" ? i.text : what === "link" ? i.link : i.passcode;
    if (!value) return;
    await copyText(value);
    set({ invite: { ...st().invite, copied: what } });
  });
  reg<{ open: boolean }>("share.manage.setInviteOpen", ({ open }) => {
    if (open) return;
    set({ invite: { open: false } });
    backToSettings();
  });

  // ---- a row's actions: extend, withdraw, delete ----
  reg<{ id: string; action: string }>("share.manage.row", async ({ id, action }) => {
    if (action === "invite") return commands.run("share.manage.invite", { id });
    if (action === "edit") return commands.run("share.manage.edit", { id });
    if (action === "extend" && access) {
      try {
        const { id: _, ...listing } = await access.apply({ op: "update", id, expiresAt: expiryFrom(DEFAULT_EXPIRY, now()) });
        set({ listing });
      } catch { set({ failed: true }); }
      return;
    }
    if (action === "withdraw" || action === "delete") {
      leaveSettings();
      set({ confirm: { open: true, kind: action, id, busy: false } });
    }
  });
  reg("share.manage.confirm", async () => {
    const c = st().confirm;
    if (!access || !c.id || c.busy) return;
    set({ confirm: { ...c, busy: true } });
    try {
      const { id: _, ...listing } = await access.apply({ op: c.kind, id: c.id });
      set({ listing, confirm: { ...c, open: false, busy: false } });
    } catch {
      set({ failed: true, confirm: { ...c, open: false, busy: false } });
    }
    backToSettings();
  });
  reg<{ open: boolean }>("share.manage.setConfirmOpen", ({ open }) => {
    if (open || st().confirm.busy) return;
    set({ confirm: { ...st().confirm, open: false } });
    backToSettings();
  });

  // ---- view models ----
  const scopeLabel = (g: Grant) => {
    const items = shareables(store.state.workspace.tree);
    const labels = [...(g.scope.folders ?? []).map((f) => `${f}/`), ...(g.scope.notes ?? []).map((p) => items.find((x) => x.path === p)?.label ?? p.replace(/^.*\//, "").replace(/\.(md|markdown)$/i, ""))];
    return labels.length > 1 ? catalog.format("share.manage.scope.several", { first: labels[0]!, count: labels.length - 1 }) : labels[0] ?? "";
  };
  const ways = (g: { link?: unknown; passcode?: unknown }) => catalog.format(`share.manage.ways.${g.link && g.passcode ? "both" : g.link ? "link" : "passcode"}`);
  const badge = (g: Grant) => {
    const state = audienceState(g, now());
    if (state === "withdrawn" || state === "expired") return catalog.format(`share.manage.state.${state}`);
    if (!g.expiresAt) return catalog.format("share.manage.state.never");
    return catalog.format("share.manage.state.expiresIn", { days: Math.max(1, Math.ceil((Date.parse(g.expiresAt) - now().getTime()) / DAY)) });
  };
  const menu = (g: Grant) => {
    const state = audienceState(g, now());
    const item = (id: string, icon: string) => ({ id, label: catalog.format(`share.manage.action.${id}`), icon });
    const items = state === "withdrawn" ? [item("delete", "delete")]
      : [item("edit", "rename"), item("extend", "history"), ...(state === "expired" ? [] : [item("withdraw", "dismiss")]), item("delete", "delete")];
    return [{ id: "audience", items }];
  };
  const STR = { type: "string" as const }, BOOL = { type: "boolean" as const };
  const OPTION = { type: "object" as const, properties: { id: STR, label: STR } };
  viewModels.register({
    id: "vm.shareManage",
    schema: {
      type: "object",
      properties: {
        available: BOOL, unavailable: BOOL, loading: BOOL, failed: BOOL, empty: BOOL, hasAudiences: BOOL, vault: BOOL, noSite: BOOL,
        rows: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: STR, name: STR, initials: STR, detail: STR, badge: STR, label: STR, active: BOOL, inviteLabel: STR, moreLabel: STR,
              menu: { type: "array", items: { type: "object", properties: { id: STR, items: { type: "array", items: { type: "object", properties: { id: STR, label: STR, icon: STR } } } } } },
            },
          },
        },
      },
    },
    reads: ["ui.share.listing", "ui.share.loading", "ui.share.failed", "workspace.tree"],
    select: (s) => {
      const m = s.ui.share;
      const grants = m.listing ? shareGrants({ version: 1, grants: m.listing.grants }) : [];
      return {
        available: Boolean(access && m.listing?.available), unavailable: Boolean(m.listing && !m.listing.available), loading: m.loading, failed: m.failed,
        empty: Boolean(m.listing?.available) && !grants.length, hasAudiences: grants.length > 0,
        vault: Boolean(m.listing?.vault), noSite: Boolean(m.listing?.available && !m.listing.site),
        rows: grants.map((g) => ({
          id: g.id, name: g.name, initials: initials(g.name),
          detail: catalog.format("share.manage.row.detail", { scope: scopeLabel(g), ways: ways(g) }),
          badge: badge(g), active: audienceState(g, now()) === "active" || audienceState(g, now()) === "soon",
          label: catalog.format("share.manage.row.label", { name: g.name }),
          inviteLabel: catalog.format("share.manage.row.invite", { name: g.name }),
          moreLabel: catalog.format("share.manage.row.more", { name: g.name }),
          menu: menu(g),
        })),
      };
    },
  });
  viewModels.register({
    id: "vm.shareEditor",
    schema: {
      type: "object",
      properties: {
        open: BOOL, creating: BOOL, title: STR, name: STR, link: BOOL, passcode: BOOL, mode: STR, modes: { type: "array", items: OPTION },
        generate: BOOL, own: BOOL, generated: STR, ownValue: STR, ownInvalid: BOOL, ownNote: STR,
        filter: STR, items: { type: "array", items: { type: "object", properties: { id: STR, label: STR, icon: STR, pressed: BOOL } } },
        picked: STR, expiry: STR, expiries: { type: "array", items: OPTION }, problem: STR, hasProblem: BOOL, nameInvalid: BOOL, busy: BOOL, submitLabel: STR, noItems: BOOL,
      },
    },
    setters: { name: "share.manage.setName", mode: "share.manage.setMode", ownValue: "share.manage.setOwn", filter: "share.manage.setFilter", expiry: "share.manage.setExpiry" },
    reads: ["ui.share.editor", "ui.share.listing", "workspace.tree"],
    select: (s) => {
      const e = s.ui.share.editor;
      const all = shareables(s.workspace.tree);
      const q = e.filter.trim().toLocaleLowerCase();
      const picked = (x: Shareable) => (x.kind === "folder" ? e.folders : e.notes).includes(x.path);
      // What's picked first, then folders and notes that match, at most 40.
      const shown = [...all.filter(picked), ...all.filter((x) => !picked(x) && (!q || x.label.toLocaleLowerCase().includes(q) || x.path.toLocaleLowerCase().includes(q)))].slice(0, 40);
      const own = e.passcode && e.mode === "own" ? passcodeProblem(e.own) : undefined;
      const count = e.notes.length + e.folders.length;
      return {
        open: e.open, creating: !e.id, busy: e.busy,
        title: e.id ? catalog.format("share.manage.editor.editTitle", { name: e.name }) : catalog.format("share.manage.editor.title"),
        name: e.name, link: e.link, passcode: e.passcode, mode: e.mode,
        modes: ["generate", "own"].map((id) => ({ id, label: catalog.format(`share.manage.passcode.${id}`) })),
        generate: e.passcode && e.mode === "generate", own: e.passcode && e.mode === "own", generated: e.generated, ownValue: e.own,
        ownInvalid: Boolean(e.own && own), ownNote: catalog.format(e.own && own ? `share.manage.problem.${own}` : "share.manage.passcode.rule"),
        filter: e.filter,
        items: shown.map((x) => ({ id: `${x.kind === "folder" ? "f" : "n"}:${x.path}`, label: x.label, icon: x.kind === "folder" ? "folder" : "document", pressed: picked(x) })),
        noItems: !all.length,
        picked: catalog.format("share.manage.editor.picked", { count }),
        expiry: e.expiry,
        expiries: EXPIRY_CHOICES.map((id) => ({ id, label: catalog.format(`share.manage.expiry.${id}`) })),
        problem: e.problem ? catalog.format(`share.manage.problem.${e.problem}`, { name: e.name.trim() }) : "", hasProblem: Boolean(e.problem),
        nameInvalid: e.problem?.startsWith("name.") ?? false,
        submitLabel: catalog.format(e.id ? "share.manage.editor.save" : "share.manage.editor.create"),
      };
    },
  });
  viewModels.register({
    id: "vm.shareInvite",
    schema: {
      type: "object",
      properties: {
        open: BOOL, title: STR, lines: { type: "array", items: { type: "object", properties: { id: STR, text: STR } } },
        link: STR, hasLink: BOOL, passcode: STR, hasPasscode: BOOL, noSite: BOOL,
        copyInvite: STR, copyLink: STR, copyPasscode: STR, copied: STR, inviteIcon: STR, linkIcon: STR, passcodeIcon: STR, name: STR, initials: STR, detail: STR,
      },
    },
    reads: ["ui.share.invite", "ui.share.listing", "workspace.tree"],
    select: (s) => {
      const i = s.ui.share.invite;
      const g = i.id ? s.ui.share.listing?.grants.find((x) => x.id === i.id) : undefined;
      const built = g ? invite(g) : undefined;
      const copied = (what: string) => i.copied === what;
      const label = (what: string) => catalog.format(copied(what) ? "share.manage.invite.copied" : `share.manage.invite.copy.${what}`);
      return {
        open: i.open && Boolean(g), title: catalog.format("share.manage.invite.title", { name: g?.name ?? "" }),
        name: g?.name ?? "", initials: initials(g?.name ?? ""), detail: g ? catalog.format("share.manage.row.detail", { scope: scopeLabel(g), ways: ways(g) }) : "",
        lines: (built?.text ?? "").split("\n").map((text, n) => ({ id: String(n), text })),
        link: built?.link ?? "", hasLink: Boolean(built?.link), passcode: built?.passcode ?? "", hasPasscode: Boolean(built?.passcode),
        noSite: Boolean(g?.link && !s.ui.share.listing?.site),
        copyInvite: label("invite"), copyLink: label("link"), copyPasscode: label("passcode"),
        inviteIcon: copied("invite") ? "check" : "copy", linkIcon: copied("link") ? "check" : "copy", passcodeIcon: copied("passcode") ? "check" : "copy",
        copied: i.copied ? catalog.format(`share.manage.invite.copiedAnnounce.${i.copied}`) : "",
      };
    },
  });
  viewModels.register({
    id: "vm.shareConfirm",
    schema: { type: "object", properties: { open: BOOL, title: STR, message: STR, confirmLabel: STR, busy: BOOL } },
    reads: ["ui.share.confirm", "ui.share.listing"],
    select: (s) => {
      const c = s.ui.share.confirm;
      const name = s.ui.share.listing?.grants.find((g) => g.id === c.id)?.name ?? "";
      return {
        open: c.open, busy: c.busy,
        title: catalog.format(`share.manage.${c.kind}.title`, { name }),
        message: catalog.format(`share.manage.${c.kind}.message`, { name }),
        confirmLabel: catalog.format(`share.manage.${c.kind}.confirm`),
      };
    },
  });
}
