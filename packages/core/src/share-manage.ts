/**
 * Settings → Sharing (WP-5.3, SHR-05, SHR-07, SHR-08, SHR-09, D-134): the owner's audiences, made,
 * changed, withdrawn, and deleted without editing `private/access.json` by hand. The shell owns the
 * file (`bridge.access`): it makes every secret, checks each change with the publisher's own rules,
 * writes it, and commits it like a note, so it's live after the next backup and publish. This module
 * keeps the dialogs' state, explains problems before asking, and builds the invite.
 */
import {
  audienceState, DEFAULT_EXPIRY, EXPIRY_CHOICES, expiryFrom, expiryUntil, INVITE_PLACEHOLDERS, inviteText, nameProblem, passcodeProblem, templateProblem,
  type AccessChange, type AccessProblem, type Audience, type ExpiryChoice, type InviteValues, type TemplateProblem,
} from "@focus-notes/seal/access";

export { inviteText, templateProblem, type Audience, type InviteValues } from "@focus-notes/seal/access";
import type { CommandRegistry } from "./commands.ts";
import type { MessageCatalog } from "./messages.ts";
import type { Store } from "./store.ts";
import type { ViewModelRegistry } from "./view-models.ts";
import { findNode, rootOf, stemOf, type TreeNode, type WorkspaceTree } from "./workspace.ts";
import { inScope, noteId } from "@focus-notes/seal/grants";

/** What the shell reports: whether there's a private repository, the site, and the share audiences, without their secrets. */
export interface AccessListing {
  available: boolean;
  /** The Pages site's address, once publishing is set up. Links need it. */
  site?: string;
  /** The owner's own invite template, from `private/access-message.json`; missing, the default (D-143). */
  template?: string;
  /** Whether the owner's vault grant is in force (it's never sent here). */
  vault: boolean;
  grants: Audience[];
}
/** The desktop's access.json (D-134). Absent in the browser. */
export interface AccessBridge {
  load(): Promise<AccessListing>;
  /** Makes one change and commits it. Rejects with a message containing `access:<problem>` when it can't. */
  apply(change: AccessChange): Promise<AccessListing & { id: string }>;
  /** Saves the invite template to `private/access-message.json`, or with null goes back to the default (D-143). */
  setTemplate(template: string | null): Promise<AccessListing>;
  /** One audience's link and passcode, for its open invite only (review L2). */
  reveal(id: string): Promise<{ link?: string; passcode?: string }>;
  /**
   * Copies the link, the passcode, or the invite: the shell fills in the invite's link, passcode, and
   * site itself, and clears the clipboard after 90 s (review L1).
   */
  copy(id: string, what: "invite" | "link" | "passcode", invite?: { template: string; values: InviteValues }): Promise<void>;
}

// ---- the invite (SHR-09) ----

/** The default template, from the catalog: the shared-computer line only for audiences with both ways in (D-125 (1)). */
export function inviteTemplate(catalog: MessageCatalog, both: boolean): string {
  const raw = Object.fromEntries(INVITE_PLACEHOLDERS.map((p) => [p, `{${p}}`]));
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
  /** Editing an audience that has a passcode: make new words when saving (otherwise it's kept). */
  renew: boolean;
  own: string;
  notes: string[];
  folders: string[];
  filter: string;
  /** "" keeps an edited audience's expiry; "date" uses `until`. */
  expiry: ExpiryChoice | "" | "date";
  /** A day picked on the calendar, `YYYY-MM-DD` (D-143). */
  until: string;
  problem?: AccessProblem | "failed";
  busy: boolean;
}
/** Editing the invite template (SHR-09, D-143). */
export interface ShareTemplateEditor {
  open: boolean;
  value: string;
  /** What the shell said when saving failed. */
  failed: boolean;
  busy: boolean;
}
export interface ShareManageState {
  listing?: AccessListing;
  loading: boolean;
  failed: boolean;
  editor: ShareEditor;
  /** The open invite, with its audience's secrets while it's open (review L2). */
  invite: { open: boolean; id?: string; copied?: "invite" | "link" | "passcode"; secrets?: { link?: string; passcode?: string } };
  confirm: { open: boolean; kind: "withdraw" | "delete"; id?: string; busy: boolean };
  template: ShareTemplateEditor;
  /** The Share popover for the note that's open (IA-VIEW-SHARE, D-143): the audience whose invite was just copied. */
  note: { open: boolean; copied?: string };
  /** Where a dialog goes back to when it closes: Settings → Sharing, or the note's Share popover. */
  from: "settings" | "note";
}
const EDITOR_CLOSED: ShareEditor = { open: false, name: "", link: true, passcode: true, mode: "generate", renew: false, own: "", notes: [], folders: [], filter: "", expiry: DEFAULT_EXPIRY, until: "", busy: false };
export const SHARE_MANAGE_CLOSED: ShareManageState = {
  loading: false, failed: false, editor: EDITOR_CLOSED, invite: { open: false }, confirm: { open: false, kind: "withdraw", busy: false },
  template: { open: false, value: "", failed: false, busy: false }, note: { open: false }, from: "settings",
};

interface S {
  ui: { share: ShareManageState; settings: { open: boolean; section: string } };
  workspace: { tree: WorkspaceTree; site?: string };
  note: { path?: string; markdown: string; initialMarkdown: string };
}
interface Ctx<St extends S> {
  store: Store<St>;
  access: AccessBridge | undefined;
  catalog: MessageCatalog;
  commands: CommandRegistry<St>;
  viewModels: ViewModelRegistry<St>;
  now?: () => Date;
}

/** A day as `YYYY-MM-DD`, where the owner is. */
const dayOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const problemOf = (e: unknown): AccessProblem | "failed" => (/access:([a-zA-Z.]+)/.exec(String((e as Error)?.message ?? e))?.[1] as AccessProblem | undefined) ?? "failed";
const DAY = 86_400_000;

export function registerShareManage<St extends S>({ store, access, catalog, commands, viewModels, now = () => new Date() }: Ctx<St>) {
  const st = () => store.state.ui.share;
  const set = (patch: Partial<ShareManageState>) => store.update((s) => ({ ...s, ui: { ...s.ui, share: { ...s.ui.share, ...patch } } }));
  const setEditor = (patch: Partial<ShareEditor>) => set({ editor: { ...st().editor, ...patch } });
  const grant = (id?: string) => st().listing?.grants.find((g) => g.id === id);
  const reg = <A extends Record<string, unknown> = Record<string, never>>(id: string, run: (a: A) => unknown) =>
    commands.register<A>({ id, title: `share.manage.command.${id.slice(13)}`, enabled: () => Boolean(access), run: async (a) => { await run(a); } });
  const text = (a: { value?: unknown }) => (typeof a.value === "string" ? a.value : "");
  /** Back to where a dialog was opened from when it closes: Settings → Sharing, or the note's Share popover. */
  const backToSettings = () => {
    if (st().from === "note") return set({ note: { open: true } });
    store.update((s) => ({ ...s, ui: { ...s.ui, settings: { ...s.ui.settings, open: true, section: "sharing" } } }));
  };
  /** A dialog takes the place of Settings or the Share popover, and remembers which to go back to. */
  const leaveSettings = () => {
    const from = st().note.open ? "note" : store.state.ui.settings.open ? "settings" : st().from;
    set({ from, note: { open: false } });
    store.update((s) => ({ ...s, ui: { ...s.ui, settings: { ...s.ui.settings, open: false } } }));
  };

  reg("share.manage.load", async () => {
    if (!access) return;
    set({ loading: !st().listing, failed: false });
    const listing = await access.load().catch(() => undefined);
    set({ loading: false, failed: !listing, ...(listing ? { listing } : {}) });
  });

  // ---- the editor ----
  reg("share.manage.add", async () => {
    if (!access) return;
    // This note, when it's private (Add people: "this note (checked)").
    const current = shareables(store.state.workspace.tree).find((x) => x.kind === "note" && (store.state.note.path ?? "").replace(/\\/g, "/").endsWith(`/private/notes/${x.path}`));
    leaveSettings();
    setEditor({ ...EDITOR_CLOSED, open: true, notes: current ? [current.path] : [] });
  });
  reg<{ id: string }>("share.manage.edit", ({ id }) => {
    const g = grant(id);
    if (!g) return;
    leaveSettings();
    setEditor({
      ...EDITOR_CLOSED, open: true, id, name: g.name, link: Boolean(g.link), passcode: Boolean(g.passcode),
      notes: g.scope.notes ?? [], folders: g.scope.folders ?? [], expiry: "",
    });
  });
  reg<{ value: string }>("share.manage.setName", (a) => setEditor({ name: text(a), problem: undefined }));
  reg("share.manage.toggleLink", () => setEditor({ link: !st().editor.link, problem: undefined }));
  reg("share.manage.togglePasscode", async () => {
    const e = st().editor;
    setEditor({ passcode: !st().editor.passcode, problem: undefined });
  });
  reg<{ value: string }>("share.manage.setMode", (a) => { if (a.value === "generate" || a.value === "own") setEditor({ mode: a.value, problem: undefined }); });
  reg("share.manage.newWords", () => setEditor({ renew: !st().editor.renew }));
  reg<{ value: string }>("share.manage.setOwn", (a) => setEditor({ own: text(a), problem: undefined }));
  reg<{ value: string }>("share.manage.setFilter", (a) => setEditor({ filter: text(a) }));
  reg<{ id: string }>("share.manage.toggleItem", ({ id }) => {
    const e = st().editor;
    const kind = id.startsWith("f:") ? "folders" : "notes";
    const path = id.slice(2);
    const list = e[kind];
    setEditor({ [kind]: list.includes(path) ? list.filter((p) => p !== path) : [...list, path], problem: undefined });
  });
  reg<{ value: string }>("share.manage.setExpiry", (a) => { if ((EXPIRY_CHOICES as readonly string[]).includes(a.value)) setEditor({ expiry: a.value as ExpiryChoice, problem: undefined }); });
  // A day on the calendar (D-143): the presets let go, and it works until the end of that day.
  reg<{ value: string }>("share.manage.setUntil", (a) => {
    const day = text(a);
    if (!day) return setEditor({ until: "", expiry: st().editor.expiry === "date" ? (st().editor.id ? "" : DEFAULT_EXPIRY) : st().editor.expiry });
    if (expiryUntil(day)) setEditor({ until: day, expiry: "date", problem: undefined });
  });
  reg<{ open: boolean }>("share.manage.setEditorOpen", ({ open }) => {
    if (open || st().editor.busy) return;
    // Nothing typed is kept once it closes (review L2).
    set({ editor: EDITOR_CLOSED });
    backToSettings();
  });

  /** What's wrong with the editor as it stands, checked as the shell will check it. */
  const editorProblem = (e: ShareEditor): AccessProblem | undefined => {
    const listing = st().listing;
    if (!e.id && listing) {
      const bad = nameProblem(listing, e.name, undefined, now());
      if (bad) return bad;
    }
    if (!e.link && !e.passcode) return "waysIn.none";
    if (e.passcode && e.mode === "own") { const bad = passcodeProblem(e.own); if (bad) return bad; }
    if (!e.notes.length && !e.folders.length) return "scope.empty";
    if (e.expiry === "date" && expiryUntil(e.until) && e.until > latestDay()) return "expiry.far";
    if (e.expiry === "date" && !untilOf(e)) return "expiry.past";
    return undefined;
  };
  /** The last day that can be picked: a year from today (D-143; the main process allows no more). */
  const latestDay = () => { const d = new Date(now().getTime()); d.setFullYear(d.getFullYear() + 1); return dayOf(d); };
  /** When a picked day ends, if it's still to come and within a year. */
  const untilOf = (e: ShareEditor) => {
    const at = expiryUntil(e.until);
    return at && Date.parse(at) > now().getTime() && e.until <= latestDay() ? at : undefined;
  };
  const expiresAtOf = (e: ShareEditor): string | null | undefined =>
    e.expiry === "date" ? untilOf(e) : e.expiry ? expiryFrom(e.expiry, now()) : undefined;
  reg("share.manage.submit", async () => {
    const e = st().editor;
    if (!access || e.busy) return;
    const bad = editorProblem(e);
    if (bad) return void setEditor({ problem: bad });
    // Worked out once, after the checks: a picked day that has passed by now stops here, never 30 days instead.
    const expiresAt = expiresAtOf(e);
    if (e.expiry === "date" && !expiresAt) return void setEditor({ problem: "expiry.past" });
    // Words are made by the shell (review L5); an edited audience keeps its passcode unless asked for new words.
    const passcode = e.passcode ? (e.mode === "own" ? { value: e.own } : { generate: true as const }) : undefined;
    const scope = { notes: e.notes, folders: e.folders };
    const before = grant(e.id);
    const keep = Boolean(before?.passcode && e.mode === "generate" && !e.renew);
    const change: AccessChange = e.id
      ? {
        op: "update", id: e.id, link: e.link, scope,
        ...(expiresAt !== undefined ? { expiresAt } : {}),
        ...(!passcode ? (before?.passcode ? { passcode: null } : {}) : keep ? {} : { passcode }),
      }
      : { op: "create", audience: { name: e.name, link: e.link, ...(passcode ? { passcode } : {}), scope, expiresAt: expiresAt === undefined ? expiryFrom(DEFAULT_EXPIRY, now()) : expiresAt } };
    setEditor({ busy: true, problem: undefined });
    try {
      const { id, ...listing } = await access.apply(change);
      set({ listing, editor: EDITOR_CLOSED });
      await openInvite(id);
    } catch (err) {
      setEditor({ busy: false, problem: problemOf(err) });
    }
  });

  // ---- the invite ----
  /** The invite's title: a note's title, or a folder's own name, never the private path above it (review L3). */
  const inviteTitle = (g: Audience) => {
    const items = shareables(store.state.workspace.tree);
    const labels = [
      ...(g.scope.notes ?? []).map((p) => items.find((x) => x.kind === "note" && x.path === p)?.label ?? p.replace(/^.*\//, "").replace(/\.(md|markdown)$/i, "")),
      ...(g.scope.folders ?? []).map((f) => f.replace(/\/+$/, "").replace(/^.*\//, "")),
    ];
    return labels.length > 1 ? catalog.format("share.manage.scope.several", { first: labels[0]!, count: labels.length - 1 }) : labels[0] ?? "";
  };
  /** The invite without its secrets: the shell fills them in when it copies. */
  const inviteParts = (g: Audience) => {
    const site = st().listing?.site;
    const both = Boolean(site && g.link && g.passcode);
    const expires = g.expiresAt ? new Intl.DateTimeFormat(catalog.locale, { dateStyle: "long" }).format(new Date(g.expiresAt)) : undefined;
    return { template: st().listing?.template ?? inviteTemplate(catalog, both), values: { name: g.name, title: inviteTitle(g), ...(expires ? { expires } : {}) } };
  };
  const openInvite = async (id: string) => {
    if (!access || !grant(id)) return;
    leaveSettings();
    set({ invite: { open: true, id } });
    const secrets = await access.reveal(id).catch(() => ({}));
    if (st().invite.open && st().invite.id === id) set({ invite: { ...st().invite, secrets } });
  };
  reg<{ id: string }>("share.manage.invite", ({ id }) => openInvite(id));
  reg<{ what: string }>("share.manage.copy", async ({ what }) => {
    const id = st().invite.id;
    if (!access || !id || !grant(id) || (what !== "invite" && what !== "link" && what !== "passcode")) return;
    const ok = await access.copy(id, what, what === "invite" ? inviteParts(grant(id)!) : undefined).then(() => true, () => false);
    if (ok && st().invite.id === id) set({ invite: { ...st().invite, copied: what } });
  });
  reg<{ open: boolean }>("share.manage.setInviteOpen", ({ open }) => {
    if (open) return;
    // The secrets go with it (review L2).
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

  // ---- the invite template (SHR-09, D-143) ----
  /** The default template, every line: what Reset shows. */
  const defaultTemplate = () => inviteTemplate(catalog, true);
  reg("share.manage.templateOpen", () => {
    if (!access || !st().listing?.available) return;
    leaveSettings();
    set({ template: { open: true, value: st().listing?.template ?? defaultTemplate(), failed: false, busy: false } });
  });
  reg<{ value: string }>("share.manage.setTemplate", (a) => set({ template: { ...st().template, value: text(a).slice(0, 4000), failed: false } }));
  // A placeholder goes on the end, on its own when the last line already has text.
  reg<{ id: string }>("share.manage.insertPlaceholder", ({ id }) => {
    if (!(INVITE_PLACEHOLDERS as readonly string[]).includes(id)) return;
    const v = st().template.value;
    set({ template: { ...st().template, value: `${v}${v && !/\s$/.test(v) ? " " : ""}{${id}}`, failed: false } });
  });
  reg("share.manage.templateReset", () => set({ template: { ...st().template, value: defaultTemplate(), failed: false } }));
  reg("share.manage.templateSave", async () => {
    const t = st().template;
    if (!access || t.busy || templateProblem(t.value)) return;
    set({ template: { ...t, busy: true, failed: false } });
    try {
      // The default saved is no file at all, so the app's own wording (and its fixes) keep applying.
      const listing = await access.setTemplate(t.value.trim() === defaultTemplate() ? null : t.value);
      set({ listing, template: { ...SHARE_MANAGE_CLOSED.template } });
      backToSettings();
    } catch {
      set({ template: { ...st().template, busy: false, failed: true } });
    }
  });
  reg<{ open: boolean }>("share.manage.setTemplateOpen", ({ open }) => {
    if (open || st().template.busy) return;
    set({ template: { ...SHARE_MANAGE_CLOSED.template } });
    backToSettings();
  });

  // ---- the Share popover for the note that's open (IA-VIEW-SHARE, D-143) ----
  /** The open note's path under the private root, as access.json names it, if it's private. */
  const privatePath = (s: St) => {
    const path = s.note.path;
    const root = path ? rootOf(s.workspace.tree, path) : undefined;
    return root?.id === "private" ? path!.slice(root.path.length).split(/[\\/]/).filter(Boolean).join("/") : undefined;
  };
  /**
   * How an audience opens a note, decided by the publisher's own `inScope` (review of 8a6627c): by its
   * path or front-matter id, or under a folder (a leading or trailing slash doesn't matter). `all`
   * counts only on the owner's grant (D-117 (2)), so it's off here; the folder it came through is
   * said as "via trips/".
   */
  const opens = (g: Audience, note: { path: string; id: string | undefined }): { via?: string } | undefined => {
    const scope = { ...g.scope, all: false };
    if (!inScope(scope, note)) return undefined;
    if (inScope({ notes: g.scope.notes ?? [] }, note)) return {};
    const folder = (g.scope.folders ?? []).find((f) => inScope({ folders: [f] }, note));
    return { via: (folder ?? "").replace(/^\/+/, "").replace(/\/+$/, "") };
  };
  reg("share.manage.noteOpen", async () => {
    if (!access) return;
    store.update((s) => ({ ...s, ui: { ...s.ui, toolbarOpen: false } } as St));
    set({ note: { open: true }, from: "note" });
    await commands.run("share.manage.load");
  });
  reg<{ open: boolean }>("share.manage.setNoteOpen", ({ open }) => { if (!open) set({ note: { open: false }, from: "settings" }); });
  // Copies one audience's invite straight from the popover; the shell fills in its secrets (review L1).
  reg<{ id: string }>("share.manage.copyInvite", async ({ id }) => {
    const g = grant(id);
    if (!access || !g) return;
    const ok = await access.copy(id, "invite", inviteParts(g)).then(() => true, () => false);
    if (ok) set({ note: { ...st().note, copied: id } });
  });
  // All people with access: Settings → Sharing, the full list.
  reg("share.manage.noteAll", async () => {
    set({ note: { open: false }, from: "settings" });
    backToSettings();
    await commands.run("share.manage.load");
  });

  // ---- view models ----
  const scopeLabel = (g: Audience) => {
    const items = shareables(store.state.workspace.tree);
    const labels = [...(g.scope.folders ?? []).map((f) => `${f}/`), ...(g.scope.notes ?? []).map((p) => items.find((x) => x.path === p)?.label ?? p.replace(/^.*\//, "").replace(/\.(md|markdown)$/i, ""))];
    return labels.length > 1 ? catalog.format("share.manage.scope.several", { first: labels[0]!, count: labels.length - 1 }) : labels[0] ?? "";
  };
  const ways = (g: { link?: unknown; passcode?: unknown }) => catalog.format(`share.manage.ways.${g.link && g.passcode ? "both" : g.link ? "link" : "passcode"}`);
  const badge = (g: Audience) => {
    const state = audienceState(g, now());
    if (state === "withdrawn" || state === "expired") return catalog.format(`share.manage.state.${state}`);
    if (!g.expiresAt) return catalog.format("share.manage.state.never");
    // Calendar days, so an audience that works until the end of a picked day says that day (D-143).
    const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    return catalog.format("share.manage.state.expiresIn", { days: Math.max(1, Math.round((midnight(new Date(g.expiresAt)) - midnight(now())) / DAY)) });
  };
  const day = (iso: string) => new Intl.DateTimeFormat(catalog.locale, { dateStyle: "medium" }).format(new Date(iso));
  const menu = (g: Audience) => {
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
        available: BOOL, unavailable: BOOL, loading: BOOL, failed: BOOL, empty: BOOL, hasAudiences: BOOL, vault: BOOL, noSite: BOOL, templateBadge: STR,
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
      const grants = m.listing?.grants ?? [];
      return {
        available: Boolean(access && m.listing?.available), unavailable: Boolean(m.listing && !m.listing.available), loading: m.loading, failed: m.failed,
        empty: Boolean(m.listing?.available) && !grants.length, hasAudiences: grants.length > 0,
        vault: Boolean(m.listing?.vault), noSite: Boolean(m.listing?.available && !m.listing.site),
        templateBadge: catalog.format(m.listing?.template ? "share.manage.template.edited" : "share.manage.template.default"),
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
        generate: BOOL, own: BOOL, generated: STR, canRenew: BOOL, renew: BOOL, ownValue: STR, ownInvalid: BOOL, ownNote: STR,
        filter: STR, items: { type: "array", items: { type: "object", properties: { id: STR, label: STR, icon: STR, pressed: BOOL } } },
        picked: STR, expiry: STR, expiries: { type: "array", items: OPTION }, problem: STR, hasProblem: BOOL, nameInvalid: BOOL, busy: BOOL, submitLabel: STR, noItems: BOOL,
        until: STR, today: STR, latest: STR, cardTitle: STR, cardInitials: STR, hasInitials: BOOL, cardDetail: STR, cardBadge: STR,
      },
    },
    setters: { name: "share.manage.setName", mode: "share.manage.setMode", ownValue: "share.manage.setOwn", filter: "share.manage.setFilter", expiry: "share.manage.setExpiry", until: "share.manage.setUntil" },
    reads: ["ui.share.editor", "ui.share.listing", "workspace.tree"],
    select: (s) => {
      const e = s.ui.share.editor;
      const had = Boolean(e.id && s.ui.share.listing?.grants.find((g) => g.id === e.id)?.passcode);
      const all = shareables(s.workspace.tree);
      const q = e.filter.trim().toLocaleLowerCase();
      const picked = (x: Shareable) => (x.kind === "folder" ? e.folders : e.notes).includes(x.path);
      // What's picked first, then folders and notes that match, at most 40.
      const shown = [...all.filter(picked), ...all.filter((x) => !picked(x) && (!q || x.label.toLocaleLowerCase().includes(q) || x.path.toLocaleLowerCase().includes(q)))].slice(0, 40);
      const own = e.passcode && e.mode === "own" ? passcodeProblem(e.own) : undefined;
      const count = e.notes.length + e.folders.length;
      const before = e.id ? s.ui.share.listing?.grants.find((g) => g.id === e.id) : undefined;
      // The card at the top (D-143): who it's for, what it opens, how, and for how long, as it stands.
      const scopeNow = count ? scopeLabel({ scope: { notes: e.notes, folders: e.folders } } as Audience) : catalog.format("share.manage.editor.picked", { count: 0 });
      const waysNow = e.link || e.passcode ? ways(e) : catalog.format("share.manage.ways.none");
      const until = e.expiry === "date" ? untilOf(e) : undefined;
      const cardBadge = e.expiry === "date"
        ? (until ? catalog.format("share.manage.editor.until", { date: day(until) }) : "")
        : e.expiry ? catalog.format(`share.manage.expiry.badge.${e.expiry}`) : before ? badge(before) : "";
      const today = now();
      const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      return {
        open: e.open, creating: !e.id, busy: e.busy,
        cardTitle: e.name.trim() || catalog.format("share.manage.editor.someone"), cardInitials: initials(e.name), hasInitials: Boolean(e.name.trim()),
        cardDetail: catalog.format("share.manage.row.detail", { scope: scopeNow, ways: waysNow }), cardBadge,
        until: e.expiry === "date" ? e.until : "", today: iso(today), latest: latestDay(),
        title: e.id ? catalog.format("share.manage.editor.editTitle", { name: e.name }) : catalog.format("share.manage.editor.title"),
        name: e.name, link: e.link, passcode: e.passcode, mode: e.mode,
        modes: ["generate", "own"].map((id) => ({ id, label: catalog.format(`share.manage.passcode.${id}`) })),
        generate: e.passcode && e.mode === "generate", own: e.passcode && e.mode === "own", ownValue: e.own,
        canRenew: Boolean(e.id && had), renew: e.renew,
        generated: catalog.format(e.id && had ? (e.renew ? "share.manage.passcode.renew" : "share.manage.passcode.keep") : "share.manage.passcode.made"),
        ownInvalid: Boolean(e.own && own), ownNote: catalog.format(e.own && own ? `share.manage.problem.${own}` : "share.manage.passcode.rule"),
        filter: e.filter,
        items: shown.map((x) => ({ id: `${x.kind === "folder" ? "f" : "n"}:${x.path}`, label: x.label, icon: x.kind === "folder" ? "folder" : "document", pressed: picked(x) })),
        noItems: !all.length,
        picked: catalog.format("share.manage.editor.picked", { count }),
        expiry: e.expiry === "date" ? "" : e.expiry,
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
      const site = s.ui.share.listing?.site;
      const parts = g ? inviteParts(g) : undefined;
      // The preview shows the secrets while the invite is open; copying goes through the shell.
      const sec = i.secrets ?? {};
      const siteValue = site ? new URL("s/", site.endsWith("/") ? site : `${site}/`).href : undefined;
      const text = parts ? inviteText(parts.template, { ...parts.values, ...(sec.link ? { link: sec.link } : {}), ...(sec.passcode && siteValue ? { passcode: sec.passcode, site: siteValue } : {}) }) : "";
      const hasLink = Boolean(g?.link && site), hasPasscode = Boolean(g?.passcode);
      const copied = (what: string) => i.copied === what;
      const label = (what: string) => catalog.format(copied(what) ? "share.manage.invite.copied" : `share.manage.invite.copy.${what}`);
      return {
        open: i.open && Boolean(g), title: catalog.format("share.manage.invite.title", { name: g?.name ?? "" }),
        name: g?.name ?? "", initials: initials(g?.name ?? ""), detail: g ? catalog.format("share.manage.row.detail", { scope: scopeLabel(g), ways: ways(g) }) : "",
        lines: text.split("\n").map((line, n) => ({ id: String(n), text: line })),
        link: sec.link ?? "", hasLink, passcode: sec.passcode ?? "", hasPasscode,
        noSite: Boolean(g?.link && !s.ui.share.listing?.site),
        copyInvite: label("invite"), copyLink: label("link"), copyPasscode: label("passcode"),
        inviteIcon: copied("invite") ? "check" : "copy", linkIcon: copied("link") ? "check" : "copy", passcodeIcon: copied("passcode") ? "check" : "copy",
        copied: i.copied ? catalog.format(`share.manage.invite.copiedAnnounce.${i.copied}`) : "",
      };
    },
  });
  viewModels.register({
    id: "vm.shareConfirm",
    schema: { type: "object", properties: { open: BOOL, title: STR, message: STR, confirmLabel: STR, busy: BOOL, name: STR, initials: STR, detail: STR } },
    reads: ["ui.share.confirm", "ui.share.listing", "workspace.tree"],
    select: (s) => {
      const c = s.ui.share.confirm;
      const g = s.ui.share.listing?.grants.find((x) => x.id === c.id);
      const name = g?.name ?? "";
      return {
        open: c.open, busy: c.busy, name, initials: initials(name),
        // Who it's about, as a card: the dialog's anchor (D-143).
        detail: g ? catalog.format("share.manage.row.detail", { scope: scopeLabel(g), ways: ways(g) }) : "",
        title: catalog.format(`share.manage.${c.kind}.title`, { name }),
        message: catalog.format(`share.manage.${c.kind}.message`, { name }),
        confirmLabel: catalog.format(`share.manage.${c.kind}.confirm`),
      };
    },
  });
  viewModels.register({
    id: "vm.shareTemplate",
    schema: {
      type: "object",
      properties: {
        open: BOOL, value: STR, busy: BOOL, invalid: BOOL, problem: STR, hasProblem: BOOL, isDefault: BOOL, canSave: BOOL,
        lines: { type: "array", items: { type: "object", properties: { id: STR, text: STR } } },
        placeholders: { type: "array", items: { type: "object", properties: { id: STR, label: STR } } },
      },
    },
    setters: { value: "share.manage.setTemplate" },
    reads: ["ui.share.template", "ui.share.listing"],
    select: (s) => {
      const t = s.ui.share.template;
      const bad = templateProblem(t.value);
      const site = s.ui.share.listing?.site;
      const siteS = site ? new URL("s/", site.endsWith("/") ? site : `${site}/`).href : catalog.format("share.manage.template.sample.site");
      // The live preview, with made-up values: never a real audience's secrets (D-134).
      const sample: InviteValues = {
        name: catalog.format("share.manage.template.sample.name"), title: catalog.format("share.manage.template.sample.title"),
        link: `${siteS}#${catalog.format("share.manage.template.sample.link")}`, passcode: catalog.format("share.manage.template.sample.passcode"), site: siteS,
        expires: new Intl.DateTimeFormat(catalog.locale, { dateStyle: "long" }).format(new Date(now().getTime() + 30 * DAY)),
      };
      const preview = bad ? "" : inviteText(t.value, sample);
      return {
        open: t.open, value: t.value, busy: t.busy, invalid: Boolean(bad && t.value), isDefault: t.value.trim() === defaultTemplate(),
        canSave: !bad && !t.busy,
        problem: t.failed ? catalog.format("share.manage.problem.failed") : bad ? catalog.format(`share.manage.problem.${bad.problem}`, { placeholder: bad.placeholder ? `{${bad.placeholder}}` : "", link: "{link}", passcode: "{passcode}" }) : "",
        hasProblem: Boolean(t.failed || bad),
        lines: preview ? preview.split("\n").map((text, n) => ({ id: String(n), text })) : [],
        placeholders: INVITE_PLACEHOLDERS.map((id) => ({ id, label: `{${id}}` })),
      };
    },
  });
  viewModels.register({
    id: "vm.shareNote",
    schema: {
      type: "object",
      properties: {
        open: BOOL, title: STR, noteTitle: STR, level: STR, isPrivate: BOOL, isPublic: BOOL, isOther: BOOL, loading: BOOL, canShare: BOOL,
        hasPeople: BOOL, onlyYou: BOOL, publicLink: STR, copied: STR,
        rows: {
          type: "array",
          items: { type: "object", properties: { id: STR, name: STR, initials: STR, detail: STR, badge: STR, label: STR, copyLabel: STR, copyName: STR, copyIcon: STR } },
        },
      },
    },
    reads: ["ui.share.note", "ui.share.listing", "note.path", "note.markdown", "note.initialMarkdown", "workspace.tree", "workspace.site"],
    select: (s) => {
      const n = s.ui.share.note;
      const path = s.note.path ?? "";
      const root = path ? rootOf(s.workspace.tree, path) : undefined;
      const rel = privatePath(s);
      const node = path ? findNode(s.workspace.tree, path)?.node : undefined;
      const noteTitle = (node?.kind === "note" && node.title) || stemOf(path.split(/[\\/]/).at(-1) ?? "");
      const listing = s.ui.share.listing;
      // The note's id as the publisher reads it (noteId), only while the dialog is open.
      const id = n.open && rel ? noteId(s.note.markdown) ?? noteId(s.note.initialMarkdown) : undefined;
      const people = rel && n.open ? (listing?.grants ?? []).flatMap((g) => {
        const how = opens(g, { path: rel, id });
        const state = audienceState(g, now());
        return how && (state === "active" || state === "soon") ? [{ g, via: how.via }] : [];
      }) : [];
      const level = root?.id === "public" ? "public" : rel ? (people.length ? "shared" : "private") : "other";
      const copiedName = n.copied ? listing?.grants.find((g) => g.id === n.copied)?.name : undefined;
      return {
        open: n.open, title: catalog.format("share.manage.note.title", { note: noteTitle }), noteTitle,
        level: catalog.format(`share.manage.note.level.${level}`),
        isPrivate: Boolean(rel), isPublic: level === "public", isOther: level === "other",
        loading: Boolean(rel && !listing), canShare: Boolean(rel && listing?.available),
        hasPeople: people.length > 0, onlyYou: Boolean(rel && listing && !people.length),
        publicLink: level === "public" && s.workspace.site ? catalog.format("share.manage.note.publicLive") : catalog.format("share.manage.note.publicSoon"),
        copied: copiedName ? catalog.format("share.manage.note.copiedAnnounce", { name: copiedName }) : "",
        rows: people.map(({ g, via }) => ({
          id: g.id, name: g.name, initials: initials(g.name),
          detail: via ? catalog.format("share.manage.note.via", { ways: ways(g), folder: `${via}/` }) : ways(g),
          badge: badge(g), label: catalog.format("share.manage.row.label", { name: g.name }),
          copyLabel: catalog.format(n.copied === g.id ? "share.manage.invite.copied" : "share.manage.invite.copy.invite"),
          copyName: catalog.format("share.manage.note.copyFor", { name: g.name }),
          copyIcon: n.copied === g.id ? "check" : "copy",
        })),
      };
    },
  });
}
