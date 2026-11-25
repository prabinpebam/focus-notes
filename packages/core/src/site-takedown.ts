/**
 * D-428's one takedown boundary: what has to come down before a note is deleted, and how. Today the shares'
 * links (`bridge.access`) and the pages on the website (`bridge.publishing`); D-429 puts both in the project's one
 * public repository, rebuilt by `sharing.takeDown()` (`access.takeDown`): a public note of a Private + Public project
 * leaves the site once its file has left the public notes.
 */
import { audienceState } from "@focus-notes/seal/access";
import type { AppState } from "./app.ts";
import type { PlatformBridge } from "./bridge.ts";
import type { TakedownDeps } from "./delete-takedown.ts";
import { publishPathOf } from "./publish-status.ts";
import { rootOf } from "./workspace.ts";
import type { Store } from "./store.ts";

export interface SiteTakedown extends Omit<TakedownDeps, "deleteLocal"> {
  /** Reads the shares again, so one made in another window counts. */
  refresh(): Promise<void>;
  /**
   * The deleted notes' active shares, their pages on a New project's website, and how many are public notes whose
   * pages the app builds (Private + Public with sharing on, D-429).
   */
  find(paths: readonly string[]): { grants: string[]; published: string[]; publicPages: number };
  /** The runtime's phases while a step runs (`deploy`, `slow`); returns the unsubscribe. */
  onPhase(listener: (phase: string) => void): () => void;
}

export function siteTakedown(store: Store<AppState>, bridge: Pick<PlatformBridge, "access" | "publishing">): SiteTakedown {
  const access = bridge.access, publishing = bridge.publishing;
  const setShare = (patch: Partial<AppState["ui"]["share"]>) => store.update((s) => ({ ...s, ui: { ...s.ui, share: { ...s.ui.share, ...patch } } }));
  /** The page is down only once the website serves the build without it (O4). */
  const served = async (build: string | undefined) => {
    if (!build) return;
    const live = await new Promise<boolean>((resolve) => {
      const off = publishing?.onLive?.((e) => { if (e.build === build) { off?.(); resolve(e.live); } });
      if (!off) resolve(true);
    });
    if (!live) throw new Error("sharing:notlive");
  };
  return {
    refresh: async () => {
      const listing = await access?.load().catch(() => undefined);
      if (listing) setShare({ listing });
    },
    find: (paths) => {
      const s = store.state;
      const rels = paths.map((p) => publishPathOf(s.workspace.tree, p)).filter((r): r is string => Boolean(r));
      const under = (rel: string, x: string) => x === rel || x.startsWith(`${rel}/`);
      return {
        grants: (s.ui.share.listing?.grants ?? []).filter((g) => g.item && ["active", "soon"].includes(audienceState(g)) && rels.some((rel) => under(rel, g.item!.path))).map((g) => g.id),
        published: s.ui.share.publication.published.filter((p) => rels.some((rel) => under(rel, p))),
        publicPages: s.ui.share.listing?.configured ? paths.filter((p) => rootOf(s.workspace.tree, p)?.id === "public").length : 0,
      };
    },
    onPhase: (listener) => {
      const offs = [access?.setup?.onStep?.(listener), publishing?.onStep?.(listener)];
      return () => { for (const off of offs) off?.(); };
    },
    withdraw: async (id) => {
      if (!access) throw new Error("access:unavailable");
      const { id: _, deployed, ...listing } = await access.apply({ op: "withdraw", id });
      setShare({ listing });
      return deployed === undefined ? {} : { deployed };
    },
    redeploy: async () => Boolean(await access?.redeploy?.()),
    unpublish: async (rels) => {
      if (!publishing) throw new Error("sharing:unavailable");
      const result = await publishing.unpublish([...rels]);
      setShare({ publication: { ...store.state.ui.share.publication, published: result.published } });
      await served(result.pending);
    },
    // D-429's one takedown: the public site rebuilt from the current records, pushed once, served.
    takeDown: async () => {
      if (!access?.takeDown) throw new Error("sharing:unavailable");
      await served((await access.takeDown()).pending);
    },
  };
}
