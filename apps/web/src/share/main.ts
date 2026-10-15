/**
 * The share reader's page, `s/` (WP-5.4, SHR-10, D-125): someone opens what was shared with them with a
 * magic link (`s/#<grant>.<secret>`) or their name and a passcode, and reads it like a public page. The
 * view is `share.view.json` on the reader's components; its state and commands are core's share reader.
 * This shell supplies the sealed site, where the session is kept, and the address's fragment.
 */
import type { AppState } from "@focus-notes/core";
import { MessageCatalog } from "@focus-notes/core/messages";
import { sharedNoteFromHash } from "@focus-notes/core/public-page";
import { createShareReader, SHARE_COMMANDS, SHARE_VIEW_MODEL, type OpenedShare, type ShareSource } from "@focus-notes/core/share-reader";
import { parseShareFragment, SiteReader, type OpenShare, type SiteFetch } from "@focus-notes/seal";
import { shareContracts, shareRegistry } from "@focus-notes/ui/share";
import { mountPage, type RuntimeApp } from "@focus-notes/ui-runtime/page";
import { messages, pages } from "@focus-notes/views";
import { createSessionStore } from "./session.ts";

// Never inside another page's frame, where it could be overlaid or clickjacked (a meta CSP can't say
// frame-ancestors): the page empties itself before it reads the link or the site.
if (window.top !== window.self) {
  document.documentElement.textContent = "";
  throw new Error("framed");
}

// The magic link's secret leaves the address bar and this page's history entry before anything else
// happens. The browser's own history (and its sync) may still record the address it was opened at, so
// on a shared computer the passcode is the better way in (D-125). Only a shared note's own fragment stays.
const takeFragment = () => {
  const link = parseShareFragment(location.hash);
  if (location.hash && (link || sharedNoteFromHash(location.hash) === undefined)) history.replaceState(null, "", location.pathname + location.search);
  return link;
};
const link = takeFragment();

// The site's own files only, from the site's root (this page is at s/): no cookies, no other origin.
const site = new URL("../", location.href);
const get: SiteFetch = async (path) => {
  // Keyrings and the site manifest change every deploy; the browser revalidates them.
  const res = await fetch(new URL(path, site), { cache: "no-cache", credentials: "omit", redirect: "error" });
  if (res.status === 404) return undefined;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
};
const opened = ({ share, session }: OpenShare): OpenedShare => ({ notes: share.notes, read: (p) => share.read(p), session, expiresAt: session.expiresAt });
// Each way in reads the site afresh, so a session reopened after a deploy finds the new build.
const source: ShareSource = {
  openLink: async (l) => opened(await new SiteReader(get).openLinkSession(l.id, l.secret)),
  openPasscode: async (name, passcode) => opened(await new SiteReader(get).openPasscodeSession(name, passcode)),
  resume: async (session) => opened(await new SiteReader(get).resume(session)),
};

const catalog = new MessageCatalog("en", messages.en!);
const reader = createShareReader({ source, store: createSessionStore(), format: (key) => catalog.format(key) });
const dropNoteFragment = () => { if (location.hash) history.pushState(null, "", location.pathname + location.search); };

// The renderer reads the reader's state as the view model `vm.share`; the page has no app state.
let seen = reader.state;
let state = { appearance: { mode: "system", system: "light" }, share: seen } as unknown as AppState;
const app: RuntimeApp = {
  store: {
    get state() {
      if (reader.state !== seen) {
        seen = reader.state;
        state = { ...state, share: seen } as AppState;
      }
      return state;
    },
    subscribe: (l) => reader.subscribe(l),
  },
  viewModels: {
    select: (id) => {
      if (id !== SHARE_VIEW_MODEL.id) throw new Error(`Unknown view model ${id}`);
      return reader.state;
    },
    get: () => undefined,
  },
  messages: catalog,
  commands: {
    has: (id) => (SHARE_COMMANDS as readonly string[]).includes(id),
    describe: (id) => { throw new Error(`The share reader's commands have no description (${id})`); },
    run: async (id, args) => {
      if (id === "share.submit") await reader.submit(String(args?.name ?? ""), String(args?.passcode ?? ""), args?.remember === true);
      else if (id === "share.setRemember") reader.setRemember(args?.value === true);
      else if (id === "share.signOut") { reader.signOut(); dropNoteFragment(); }
      else if (id === "share.showList") { reader.showList(); dropNoteFragment(); }
    },
  },
  bridge: { platform: "web" },
};

// A new note or list starts at the top, with focus on the page's main landmark for screen readers.
let shown: unknown;
reader.subscribe(() => {
  const s = reader.state;
  const now = s.phase === "note" ? s.note : s.phase === "list" ? s.list : undefined;
  if (now === shown) return;
  shown = now;
  if (now) requestAnimationFrame(() => { scrollTo(0, 0); document.getElementById("note")?.focus({ preventScroll: true }); });
});

// Links between shared notes, Back and Forward, and a link pasted into this tab's address bar.
addEventListener("hashchange", () => {
  const pasted = takeFragment();
  void (pasted ? reader.start(pasted, "") : reader.navigate(location.hash));
});

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root in the entry document");
mountPage(root, "share", { app, registry: shareRegistry, contracts: shareContracts, views: pages });
void reader.start(link, location.hash);
