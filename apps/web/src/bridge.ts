/**
 * The web app's PlatformBridge (D-80, D-90): notes written in this browser live in IndexedDB, and the
 * instance's own notes are read from its site, public ones as files and private ones as sealed copies
 * that the owner's passphrase opens. Nothing is written anywhere but this browser, and there's no
 * GitHub credential here at all.
 */
import {
  BUNDLE_MAX_BYTES, bundleFileName, formatWorkspaceFile, innerPath, isReadOnlyPath, makeBundle, OpError, parseBundle, planFlatOps, planImport, readWorkspaceFormat, sourceOf, titleOfMarkdown, UnlockError,
  WORKSPACE_FORMAT, type AppStateFile, type InstanceBridge, type NoteSummary, type PlatformBridge, type VaultStatus, type WorkspaceBridge,
} from "@focus-notes/core";
import { SealError, SiteReader, type OpenVault, type SiteFetch } from "@focus-notes/seal";
import { openTextFile, saveTextFile } from "@focus-notes/ui/files";
import { WebDb } from "./idb.ts";
import { WEB_META } from "@focus-notes/core/inventory";

const WELCOME = `# Welcome to Focus Notes

This note lives in this browser, and so does everything you write here. It's saved as you type and works offline. Nothing is sent anywhere.

- Press **Ctrl+.** (or click the red dot) for the toolbar.
- Press **Ctrl+Shift+/** for every keyboard shortcut.
- To keep your notes in your own GitHub repository, use the desktop app: it saves there, and this site shows them. Bring notes from here with **Export my notes** in the toolbar's ⋯ menu.
`;

/** A key this browser remembers for the vault (PKG-10): non-extractable, with the salt it was made for. */
interface RememberedKey { key: CryptoKey; salt: string }
const REMEMBERED = WEB_META.vaultKey;
/** The format of the notes in this browser (DST-05), as the text of a workspace.json. */
const FORMAT = WEB_META.workspaceFormat;
/** Folders made in the Files panel, which may be empty (D-94). Written only once there is one. */
const FOLDERS = WEB_META.folders;
/** What earlier versions stored for browser sync (D-81, D-82), removed on open (D-90). */
const RETIRED_META = ["token", "vaultKey", "connection", "login"];

const titled = (title: string | undefined) => (title ? { title } : {});

export interface WebBridge extends PlatformBridge {
  db: WebDb;
  instance: InstanceBridge;
}

export interface WebBridgeOptions {
  /** Reads a file of the site; tests pass their own. */
  fetchSite?: SiteFetch;
}

const siteFetch: SiteFetch = async (path) => {
  // The manifest and keyring change every deploy; the browser revalidates them instead of trusting a cache.
  const res = await fetch(new URL(path, document.baseURI), { cache: "no-cache", credentials: "omit", redirect: "error" });
  if (res.status === 404) return undefined;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
};

export async function createWebBridge(options: WebBridgeOptions = {}): Promise<WebBridge> {
  const db = await WebDb.open();
  for (const k of RETIRED_META) await db.deleteMeta(k);
  void navigator.storage?.persist?.().catch(() => false);
  const dark = matchMedia("(prefers-color-scheme: dark)");
  const reader = new SiteReader(options.fetchSite ?? siteFetch);

  // ---- the instance's notes ----
  let open: OpenVault | undefined;
  let status: VaultStatus = { state: "none" };
  const listeners = new Set<(v: VaultStatus) => void>();
  const setStatus = (v: VaultStatus) => {
    status = v;
    for (const l of listeners) l(v);
  };
  const info = (async () => {
    const m = await reader.manifest();
    if (!m) return undefined;
    const notes = await reader.publicNotes().catch(() => []);
    return { manifest: m, publicNotes: notes };
  })();
  // A key this browser remembers opens the vault before anything is shown (PKG-10).
  const ready = (async () => {
    const i = await info;
    if (!i?.manifest.vault) return;
    setStatus({ state: "locked" });
    const remembered = await db.getMeta<RememberedKey>(REMEMBERED);
    if (!remembered) return;
    try {
      open = await reader.unlockWithKey(remembered.key, remembered.salt);
      setStatus({ state: "unlocked", owner: open.owner, remembered: true });
    } catch (e) {
      // A changed passphrase makes the old key useless: forget it. Offline, keep it for next time.
      if (e instanceof SealError && e.code === "key") await db.deleteMeta(REMEMBERED);
    }
  })();

  const instance: InstanceBridge = {
    async info() {
      const i = await info;
      await ready;
      return i ? { publicNotes: i.publicNotes.length, hasVault: i.manifest.vault } : undefined;
    },
    vault: () => status,
    onVault(l) { listeners.add(l); return () => listeners.delete(l); },
    async unlock(passphrase, remember) {
      await ready;
      try {
        const r = await reader.unlock(passphrase);
        open = r.vault;
        if (remember) await db.setMeta(REMEMBERED, { key: r.key, salt: r.salt } satisfies RememberedKey);
        else await db.deleteMeta(REMEMBERED);
        setStatus({ state: "unlocked", owner: open.owner, remembered: remember });
      } catch (e) {
        if (e instanceof SealError) throw new UnlockError(e.code === "key" ? "wrong" : "unavailable");
        throw new UnlockError(navigator.onLine ? "unavailable" : "offline");
      }
    },
    async lock() {
      open = undefined;
      await db.deleteMeta(REMEMBERED);
      if (status.state !== "none") setStatus({ state: "locked" });
    },
    origin: () => location.origin.replace(/^https?:\/\//, ""),
  };

  const localNotes = async () => (await db.allNotes()).filter((n) => !n.deleted);
  /** A newer app may have written this browser's notes: this one then never writes them (DST-05). */
  const assertWritable = async () => {
    if (readWorkspaceFormat(await db.getMeta<string>(FORMAT)).access !== "write") throw new Error("Read-only: these notes were saved by a newer Focus Notes");
  };

  // This browser's notes and the instance's read-only ones, as one workspace (D-90, WP-2.3).
  const workspace: WorkspaceBridge = {
    async info() {
      let format = await db.getMeta<string>(FORMAT);
      if (format === undefined) await db.setMeta(FORMAT, (format = formatWorkspaceFile({ formatVersion: WORKSPACE_FORMAT })));
      return { folder: "", format };
    },
    async scan() {
      const mine = await localNotes();
      const folders = (await db.getMeta<string[]>(FOLDERS)) ?? [];
      const i = await info;
      await ready;
      return {
        folder: "",
        roots: [
          { id: "local", path: "", readOnly: false },
          ...(i ? [{ id: "public" as const, path: "public:", readOnly: true }] : []),
          ...(i?.manifest.vault ? [{ id: "private" as const, path: "private:", readOnly: true }] : []),
        ],
        entries: [
          ...folders.map((path) => ({ path, kind: "folder" as const })),
          ...mine.map((n) => ({ path: n.path, kind: "note" as const, ...titled(titleOfMarkdown(n.text)) })),
          ...(i?.publicNotes ?? []).map((n) => ({ path: `public:${n.path}`, kind: "note" as const, published: true, ...titled(n.title) })),
          ...(open?.notes ?? []).map((n) => ({ path: `private:${n.path}`, kind: "note" as const, published: true, ...titled(n.title) })),
        ],
      };
    },
    writeFormat: (text) => db.setMeta(FORMAT, text),
    async renameNote(from, to) {
      if (isReadOnlyPath(from) || isReadOnlyPath(to)) throw new Error("Read-only note");
      await assertWritable();
      const taken = await db.getNote(to);
      if (taken && !taken.deleted && from.toLowerCase() !== to.toLowerCase()) throw new Error("That name is taken");
      await db.moveNote(from, to, Date.now());
    },
    // A Files panel batch: checked whole, then written in one transaction (D-94).
    async apply(ops) {
      await assertWritable().catch(() => { throw new OpError("readOnly"); });
      const stored = await db.getMeta<string[]>(FOLDERS);
      const plan = planFlatOps(await db.allNotes(), stored ?? [], ops, Date.now());
      const changed = JSON.stringify(plan.folders) !== JSON.stringify(stored ?? []);
      await db.applyBatch(plan.put, plan.remove, changed ? { key: FOLDERS, value: plan.folders } : undefined);
    },
  };

  const bridge: WebBridge = {
    platform: "web",
    db,
    instance,
    workspace,
    async readNote(path) {
      const source = sourceOf(path);
      if (source === "public") return reader.readPublic(innerPath(path));
      if (source === "private") {
        await ready;
        if (!open) throw new Error("Locked");
        return open.read(innerPath(path));
      }
      const n = await db.getNote(path);
      if (!n || n.deleted) throw new Error(`No note at ${path}`);
      return n.text;
    },
    async writeNote(path, text) {
      // The instance's notes are read-only here (D-90).
      if (isReadOnlyPath(path)) throw new Error("Read-only note");
      await assertWritable();
      const old = await db.getNote(path);
      if (old && old.text === text && !old.deleted) return;
      await db.putNote({ path, text, updated: Date.now() });
    },
    chooseNote: async () => undefined,
    async listNotes(): Promise<NoteSummary[]> {
      const mine: NoteSummary[] = (await localNotes()).map((n) => ({ path: n.path, updated: n.updated }));
      const i = await info;
      await ready;
      const pub: NoteSummary[] = (i?.publicNotes ?? []).map((n) => ({ path: `public:${n.path}`, title: n.title, updated: Date.parse(n.updated) || 0 }));
      const priv: NoteSummary[] = (open?.notes ?? []).map((n) => ({ path: `private:${n.path}`, title: n.title, updated: Date.parse(n.updated) || 0 }));
      return [...mine, ...pub, ...priv];
    },
    async newNotePath(near) {
      const dir = near && near.includes("/") ? near.slice(0, near.lastIndexOf("/") + 1) : "";
      for (let i = 1; ; i++) {
        const p = `${dir}${i === 1 ? "Untitled" : `Untitled ${i}`}.md`;
        if (!(await db.getNote(p))) return p;
      }
    },
    async defaultNotePath() {
      const notes = await localNotes();
      if (notes.length) return notes.sort((a, b) => b.updated - a.updated)[0]!.path;
      // A first visit to a site with public notes opens the newest one, read-only (FRE-09).
      const pub = (await info)?.publicNotes ?? [];
      if (pub.length) return `public:${[...pub].sort((a, b) => Date.parse(b.updated) - Date.parse(a.updated))[0]!.path}`;
      await db.putNote({ path: "Welcome.md", text: WELCOME, updated: Date.now() });
      return "Welcome.md";
    },
    loadAppState: async () => (await db.getMeta<AppStateFile>(WEB_META.appState)) ?? { version: 1 },
    saveAppState: (s) => db.setMeta(WEB_META.appState, s),
    systemScheme: () => (dark.matches ? "dark" : "light"),
    onSystemSchemeChange(listener) {
      const h = () => listener(dark.matches ? "dark" : "light");
      dark.addEventListener("change", h);
      return () => dark.removeEventListener("change", h);
    },
    toggleFullScreen() {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen?.();
    },
    openExternal(url) {
      // Only GitHub's own pages are ever opened.
      if (/^https:\/\/github\.com\//.test(url)) window.open(url, "_blank", "noopener,noreferrer");
    },
    async copyText(text) {
      await navigator.clipboard.writeText(text);
    },
    openLink(url) {
      // A note's link opens in a new tab, never in this one, and only for web and mail (EDT-13).
      if (/^(https?:\/\/|mailto:)\S+$/i.test(url)) window.open(url, "_blank", "noopener,noreferrer");
    },
    async exportNotes() {
      const notes = await localNotes();
      saveTextFile(bundleFileName(), JSON.stringify(makeBundle(notes), null, 2));
      return notes.length;
    },
    async importNotes() {
      const text = await openTextFile(".json,application/json", BUNDLE_MAX_BYTES);
      if (text === undefined) return undefined;
      await assertWritable();
      const bundle = parseBundle(text);
      const existing = new Map((await localNotes()).map((n) => [n.path, n.text]));
      const plan = planImport(bundle, existing);
      for (const n of plan) await db.putNote({ path: n.path, text: n.text, updated: Number.isFinite(n.updated) ? n.updated : Date.now() });
      return { added: plan.length, renamed: plan.filter((n) => n.renamed).length };
    },
  };
  return bridge;
}
