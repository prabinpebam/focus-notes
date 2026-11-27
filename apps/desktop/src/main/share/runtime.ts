import { createHash } from "node:crypto";
import { cp, mkdtemp, readdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { GitHubError, type GitHubApi } from "@focus-notes/github";
import { publish } from "@focus-notes/seal/publish";
import type { SharingLayout } from "./layout.ts";
import { setTimeout as delay } from "node:timers/promises";
import { publicPublishing, type PublicDeploy, type PublicTaskStep } from "./public-publishing.ts";
import { stagePublicSelection, type ConfirmedSelection } from "./public-selection.ts";
import { configurePublicSite, requirePublishedArtifact, type SealedArtifactPublisher } from "./site.ts";
import { fetchDeployedSite, pagesArtifactPublisher, servedBuild, type DeployedSiteGet, type FailedBuild, type PagesPublisher } from "./site-publish.ts";
import { sharedImageDestinations } from "./media.ts";
import { sharingSetup, sitePairingStore, type SharingSetupStep, type SitePairing } from "./setup.ts";
import { applySiteLookToSite, isSiteLook, readSiteLook, siteLookFile, siteLookText, type SiteLook } from "./site-look.ts";
import type { PushGate } from "../git/push-gate.ts";

const exists = (path: string) => stat(path).then(() => true, () => false);
/** Static, script-free: the site's root sends readers to the published index at `n/`. */
const HOME_REDIRECT = '<!doctype html>\n<meta charset="utf-8">\n<meta http-equiv="refresh" content="0; url=n/">\n<link rel="canonical" href="n/">\n<title>Published notes</title>\n<a href="n/">Published notes</a>\n';
/** The page renderer's empty home (apps/web/reader/render.ts, D-421); renderers before it have none. */
type EmptyHomeRenderer = { renderEmptyHome?(input: { siteUrl?: string; assets: { css: string[]; fonts: string[] } }): { file: string; html: string } };
/** Writes the site's empty home with the renderer's stylesheet and fonts: static words only, nothing from the project. */
async function writeEmptyHome(reader: string | undefined, directory: string, siteUrl: string): Promise<void> {
  if (!reader || !await exists(join(reader, "render.mjs"))) return;
  const renderer = await import(pathToFileURL(join(reader, "render.mjs")).href) as EmptyHomeRenderer;
  if (!renderer.renderEmptyHome) return;
  const files = await readdir(join(reader, "assets")).catch(() => [] as string[]);
  if (files.length) await cp(join(reader, "assets"), join(directory, "assets"), { recursive: true, force: false, errorOnExist: false });
  const { file, html } = renderer.renderEmptyHome({ siteUrl, assets: { css: files.filter(f => f.endsWith(".css")), fonts: files.filter(f => /\.woff2?$/.test(f)) } });
  if (file !== "index.html") return;
  await writeFile(join(directory, file), html);
}
/** D-436: each published page in a built site (`n/…/index.html`) by the SHA-256 of its bytes, to tell its deploy is served. */
async function pageHashes(directory: string): Promise<Map<string, string>> {
  const pages = new Map<string, string>();
  const root = join(directory, "n");
  const entries = await readdir(root, { recursive: true, withFileTypes: true }).catch(() => []);
  for (const e of entries) {
    if (!e.isFile() || e.name !== "index.html") continue;
    const full = join(e.parentPath, e.name);
    pages.set(relative(directory, full).split(sep).join("/"), createHash("sha256").update(await readFile(full)).digest("hex"));
  }
  return pages;
}
/** Notes on the current public site, by notes-root-relative path (G3). Recorded only after their deploy. */
function parsePublished(text: string): string[] {
  const value = JSON.parse(text) as { version?: unknown; notes?: unknown };
  if (value.version !== 1 || !Array.isArray(value.notes) || value.notes.some(n => typeof n !== "string")) throw new Error("sharing:record");
  return value.notes as string[];
}
/** A Publish or Unpublish problem as a plain `sharing:<code>`; leak-check failures keep their own (content-free) message. */
function publishProblem(error: unknown): unknown {
  if (!(error instanceof GitHubError)) return error;
  return new Error(`sharing:${error.status === 0 ? "offline" : error.unauthorized ? "signedout" : error.rateLimited ? "ratelimited"
    : error.status === 403 || error.status === 404 ? "refused" : "failed"}`);
}

export type RenameFollowed = { paths: string[]; status: "live" } | { paths: string[]; status: "pending"; build: string } | { paths: string[]; status: "failed"; problem: string };

export function sharingRuntime(deps: {
  root(): string;
  layout(): SharingLayout;
  api(): Promise<GitHubApi | undefined>;
  repository(dir: string): Promise<string | undefined>;
  write(file: string, text: string): Promise<void>;
  written(file: string): void;
  temporary: string;
  /** Website uploads to the project's own public repository wait their turn with its backup pushes (D-432). */
  pushGate?: PushGate;
  /** Defaults to pushing the sealed artifact to the paired public site and waiting for Pages. */
  publisher?: SealedArtifactPublisher;
  /** Publishes the emptied old separate site after its shares moved (D-429); defaults to its own Pages publisher. */
  retirePublisher?: SealedArtifactPublisher;
  /** The deployed site's fetch, for the default publisher. */
  get?: DeployedSiteGet;
  /** A legacy pair's public source must be held through verified preservation and deployed removal. */
  removalLane?<T>(work: () => Promise<T>): Promise<T>;
  preserve?(layout: SharingLayout): Promise<void>;
  remove?(pairing: SitePairing, layout: SharingLayout): Promise<void>;
  /** Withdraws every earlier share so re-enabling can never republish it; runs before removal. */
  withdrawShares?(): Promise<unknown>;
  step?(step: SharingSetupStep): void;
  /** The page renderer's folder (`render.mjs`, `assets/`): plaintext Publish needs its pages for Copy link. */
  reader?(): string | undefined;
  publishStep?(step: PublicTaskStep): void;
  /** How long GitHub's build may take before the progress says Still working (default 2 minutes, D-427). */
  pagesSlowMs?: number;
  /** How long a Publish waits for Pages before it reports Still publishing (default 10 minutes). */
  pagesWaitMs?: number;
  /** Background checking after that: how often, and for how long before it's a failure (default 15 s, 1 hour). */
  pagesWatch?: { delayMs?: number; ceilingMs?: number };
  /** A pending Publish or Unpublish's build is live, or still isn't at the ceiling (O4). */
  publishLive?(event: { build: string; live: boolean }): void;
  /** A renamed or moved published note's deploy at its new address (D-423): live, pending (O4) or failed with Retry. */
  renameFollowed?(event: RenameFollowed): void;
  /** D-436: a site build's upload landed: when it read its source, and the hash of each page (`n/…/index.html`) it carries. */
  siteBuilt?(site: { started: number; pages: ReadonlyMap<string, string> }): void;
  /** D-436: a site build or its Pages deploy failed. */
  siteFailed?(error: unknown): void;
}) {
  let current: { root: string; service: ReturnType<typeof sharingSetup> } | undefined;
  let tasks: ReturnType<typeof publicPublishing> | undefined, tasksRoot: string | undefined;
  /** The new paths of the last rename deploy, for its Retry (D-423). */
  let lastFollow: string[] = [];
  // Publishing, setup and removal never interleave, so a share can't redeploy a site being turned off.
  let lane: Promise<unknown> = Promise.resolve();
  const serial = <T>(work: () => Promise<T>): Promise<T> => {
    const next = lane.then(work, work);
    lane = next.catch(() => {});
    return next;
  };
  const get = deps.get ?? fetchDeployedSite;
  /** D-436: the running build's "its upload landed" callback, for the publisher's `pushed`. */
  let onPushed: (() => void) | undefined;
  /** The last upload whose GitHub build failed, with what it was built from, so Retry builds it again instead of uploading again (D-427). */
  let failedBuild: (FailedBuild & { inputs: string; empty: boolean }) | undefined;
  let failing: FailedBuild | undefined;
  // Set from the publisher's callback, so read through a function the compiler doesn't narrow.
  const lastFailing = (): FailedBuild | undefined => failing;
  const publisher: SealedArtifactPublisher = deps.publisher ?? pagesArtifactPublisher({
    api: deps.api,
    target: async project => { const saved = await bound().read(); return saved?.project === project ? saved : undefined; },
    get, ...(deps.pagesWaitMs === undefined ? {} : { timeoutMs: deps.pagesWaitMs }),
    ...(deps.pagesSlowMs === undefined ? {} : { slowAfterMs: deps.pagesSlowMs }),
    pushed: () => { deps.step?.("deploy"); onPushed?.(); },
    slow: () => deps.step?.("slow"),
    failed: failed => { failing = failed; },
    // Private + Public (D-429): the site is the project's public repository, which the backup pushes to as well.
    exclusive: work => {
      const layout = deps.layout();
      return deps.pushGate && layout.legacy && layout.publicDir ? deps.pushGate(layout.publicDir, work) : work();
    },
  });
  const resumable = typeof (publisher as Partial<PagesPublisher>).resume === "function" ? publisher as PagesPublisher : undefined;
  /** Builds pushed to the site this session, oldest first: a newer one being served means an older one's notes are live too. */
  const pushed: string[] = [];
  /** Checks in the background until Pages serves `build` (or a later push), then says so once (O4). */
  const watchLive = (site: string, build: string, stillHere: () => boolean) => {
    const at = pushed.indexOf(build), until = Date.now() + (deps.pagesWatch?.ceilingMs ?? 3_600_000);
    void (async () => {
      while (Date.now() < until) {
        await delay(Math.max(1, Math.min(deps.pagesWatch?.delayMs ?? 15_000, until - Date.now())));
        if (!stillHere()) return;
        // Offline or a slow answer is only a missed check; the next one tries again.
        const served = await servedBuild(get, site).catch(() => undefined);
        if (!stillHere()) return;
        if (served !== undefined && pushed.indexOf(served) >= at) { deps.publishLive?.({ build, live: true }); return; }
      }
      if (stillHere()) deps.publishLive?.({ build, live: false });
    })();
  };
  const bound = () => {
    const root = deps.root(), layout = deps.layout();
    const privateDir = layout.privateDir;
    if (!privateDir) throw new Error("sharing:unlinked");
    const guard = () => {
      if (deps.root() !== root || deps.layout().privateDir !== privateDir) throw new Error("sharing:changed");
    };
    const file = join(privateDir, ".focus-notes", "site-pairing.json");
    const store = sitePairingStore(file, async (file, text) => {
      guard();
      await deps.write(file, text);
      guard();
      deps.written(file);
    });
    const read = async () => {
      guard();
      const saved = await store.read();
      guard();
      if (saved && saved.project !== await deps.repository(privateDir)) throw new Error("sharing:changed");
      guard();
      return saved;
    };
    /**
     * The pairing sharing runs on now. In the Private + Public layout a pairing with any site but the project's own
     * public repository is an older separate site (D-425): it isn't used, and the next Turn on moves its shares (D-429).
     */
    const current = async () => {
      const saved = await read();
      if (!saved || !layout.legacy) return saved;
      const own = layout.publicDir ? await deps.repository(layout.publicDir) : undefined;
      guard();
      return own && own.toLowerCase() === `${saved.owner}/${saved.name}`.toLowerCase() ? saved : undefined;
    };
    const publishedFile = join(privateDir, ".focus-notes", "published.json");
    const readPublished = async (): Promise<string[]> => {
      guard();
      let text: string;
      try { text = await readFile(publishedFile, "utf8"); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
      guard();
      return parsePublished(text);
    };
    /**
     * The recorded notes that are still there: one renamed, moved or deleted since leaves the site at the
     * next deploy instead of stopping every later Publish or share (D-419); nothing private is added.
     */
    const presentPublished = async (): Promise<string[]> => {
      const notes = await readPublished(), root = layout.privateNotes;
      if (!root) return notes;
      const here = await Promise.all(notes.map(p => stat(join(root, ...p.split("/"))).then(s => s.isFile(), () => false)));
      guard();
      return notes.filter((_, i) => here[i]);
    };
    const writePublished = async (notes: readonly string[]) => {
      guard();
      await deps.write(publishedFile, `${JSON.stringify({ version: 1, notes }, null, 2)}\n`);
      guard();
      deps.written(publishedFile);
    };
    /** Seals and deploys the site with the recorded published notes, or `selection` for a Publish or Unpublish (G3). */
    /** What a site build is made from: the share records and the published list. Changed since a failed build: upload afresh. */
    const inputs = async () => {
      const hash = createHash("sha256");
      for (const file of [join(privateDir, "access.json"), publishedFile, join(privateDir, ".focus-notes", "site-pairing.json"), siteLookFile(privateDir)]) {
        hash.update(file).update(await readFile(file).catch(() => Buffer.from("absent")));
      }
      return hash.digest("hex");
    };
    const build = async (pairing: SitePairing, empty = false, selection?: ConfirmedSelection): Promise<PublicDeploy> => {
      guard();
      // Retry after GitHub's build failed: the upload is already on the site, so build that again (D-427).
      const memo = failedBuild;
      failedBuild = undefined;
      if (memo && !selection && memo.empty === empty && memo.project === pairing.project && resumable && memo.inputs === await inputs()) {
        failing = undefined;
        let result: Awaited<ReturnType<PagesPublisher["resume"]>>;
        try { result = await resumable.resume(memo); }
        catch (error) { const f = lastFailing(); if (f) failedBuild = { ...f, inputs: memo.inputs, empty }; throw error; }
        guard();
        if (result) {
          requirePublishedArtifact(result, pairing, { directory: "", build: memo.build });
          return { commit: result.status === "published" ? result.commit : "" };
        }
      }
      const before = selection ? "" : await inputs();
      // D-436: what this build read is the source as of now; a note changed after this waits for a later build.
      const started = Date.now();
      deps.step?.("seal");
      const notes = empty || layout.legacy ? [] : selection?.notes ?? await presentPublished();
      // Private + Public layout (D-429): the project's own public repository is the site, so its published pages
      // (every note in its public notes/) are built beside the sealed shares, even when sharing is turned off.
      const publicNotes = layout.legacy && layout.publicDir ? join(layout.publicDir, "notes") : undefined;
      const reader = notes.length || publicNotes ? deps.reader?.() : undefined;
      if ((notes.length && (!reader || !layout.privateNotes)) || (publicNotes && !reader)) throw new Error("sharing:unavailable");
      const directory = await mkdtemp(join(deps.temporary, "sealed-site-"));
      const staging = notes.length ? await mkdtemp(join(deps.temporary, "public-notes-")) : undefined;
      try {
        const selected = staging ? await stagePublicSelection({ notesRoot: layout.privateNotes!, projectRoot: privateDir, selection: { ...selection, notes }, staging }) : undefined;
        guard();
        // Removal deploys an empty site: no public notes, no vault and no share keyrings. In the Private + Public
        // layout it keeps the published pages, which were public before sharing was turned on (D-429).
        const artifact = await publish(empty ? {
          site: directory, owner: pairing.owner, siteUrl: pairing.site,
          ...(publicNotes ? { notes: publicNotes, reader: reader! } : {}),
        } : {
          private: privateDir, sealedMedia: sharedImageDestinations,
          // `published`: the confirmed notes are public on purpose; every other private note stays leak-checked.
          ...(staging ? { notes: staging, published: [...notes], reader: reader!, publicMedia: selected?.media ?? [], publicMediaFrom: join(staging, ".media") } : {}),
          // The project's public notes, leak-checked against every private note and share secret (D-429).
          ...(publicNotes ? { notes: publicNotes, reader: reader! } : {}),
          site: directory, owner: pairing.owner, siteUrl: pairing.site,
        });
        guard();
        // The share reader page (s/), so a link or access code opens on the site itself; static app code only,
        // placed after the leak check, which looks for private text and names in the site's data.
        const page = empty ? undefined : deps.reader?.();
        if (page && await stat(join(page, "site", "s", "index.html")).then(() => true, () => false)) {
          await cp(join(page, "site"), directory, { recursive: true, force: false, errorOnExist: false });
          guard();
        }
        // The paired site is this project's alone: its own address opens the published notes' index (D-419),
        // or, with nothing published (Turn off too), a home that says so instead of a 404 (D-421).
        if (await exists(join(directory, "n", "index.html"))) {
          if (!await exists(join(directory, "index.html"))) await writeFile(join(directory, "index.html"), HOME_REDIRECT);
        } else if (!await exists(join(directory, "index.html"))) await writeEmptyHome(deps.reader?.(), directory, pairing.site);
        // D-430: the website's look on every page (published pages, the home and s/); allowlisted values only.
        const look = await readSiteLook(siteLookFile(privateDir));
        guard();
        if (look) await applySiteLookToSite(directory, look);
        deps.step?.("push");
        if (selection) deps.publishStep?.("publishing");
        const sealed = { directory, build: artifact.build };
        failing = undefined;
        const pageMap = deps.siteBuilt ? await pageHashes(directory) : undefined;
        // D-436: the upload is on the site's branch (the publisher says so before it waits for Pages): its pages are what to look for.
        let told = false;
        const tell = () => { if (!told && pageMap) { told = true; deps.siteBuilt?.({ started, pages: pageMap }); } };
        onPushed = tell;
        let result: Awaited<ReturnType<SealedArtifactPublisher>>;
        try { result = await publisher(pairing.project, sealed); }
        catch (error) {
          const f = lastFailing(); if (f && !selection) failedBuild = { ...f, inputs: before, empty };
          deps.siteFailed?.(error);
          throw error;
        } finally { onPushed = undefined; }
        if (result.status === "published") pushed.push(sealed.build);
        if (result.status === "published") tell();
        guard();
        // Only a Publish or Unpublish may outlast the wait: its commit is on the site's branch, so Pages serving it is
        // a matter of time; setup, sharing pushes and Turn off still need the site served now.
        const pages = requirePublishedArtifact(result, pairing, sealed, Boolean(selection));
        const commit = result.status === "published" ? result.commit : "";
        if (pages === "built") return { commit };
        watchLive(pairing.site, sealed.build, () => deps.root() === root && deps.layout().privateDir === privateDir);
        return { commit, pending: sealed.build };
      } finally {
        await rm(directory, { recursive: true, force: true });
        if (staging) await rm(staging, { recursive: true, force: true });
      }
    };
    const writeLook = async (look: SiteLook) => {
      const file = siteLookFile(privateDir);
      guard();
      await deps.write(file, siteLookText(look));
      guard();
      deps.written(file);
    };
    return { root, layout, privateDir, guard, store, read, current, build, readPublished, presentPublished, writePublished, writeLook };
  };
  const service = () => {
    const ctx = bound();
    if (current?.root === ctx.root) return current.service;
    const setup = sharingSetup({
      api: async () => { ctx.guard(); const api = await deps.api(); ctx.guard(); return api; },
      project: async () => { ctx.guard(); const repo = await deps.repository(ctx.privateDir); ctx.guard(); return repo; },
      // Private + Public layout: the project's own public repository is the one site; nothing is created (D-429).
      ...(ctx.layout.legacy && ctx.layout.publicDir ? {
        site: async () => { ctx.guard(); const repo = await deps.repository(ctx.layout.publicDir!); ctx.guard(); return repo; },
      } : {}),
      read: ctx.read, write: ctx.store.write,
      initialize: async (pairing, step) => {
        ctx.guard();
        const api = await deps.api();
        if (!api) throw new Error("sharing:signedout");
        ctx.guard();
        await configurePublicSite(api, pairing, step, { replaceManaged: ctx.layout.legacy });
        ctx.guard();
        step("pages");
        const pages = await api.pages(pairing.owner, pairing.name);
        ctx.guard();
        if (!pages || pages.buildType !== "workflow") {
          await api.usePagesWorkflow(pairing.owner, pairing.name, Boolean(pages));
          ctx.guard();
        }
        await ctx.build(pairing);
      },
      preserve: async () => {
        ctx.guard();
        if (deps.preserve) await deps.preserve(ctx.layout);
        else {
          // Working notes and media already live only in the private project (a legacy pair's public notes stay in
          // its own repository, D-425); removal empties only the paired site and never touches them.
          const notes = ctx.layout.privateNotes;
          if (!notes) throw new Error("sharing:preservation");
          const [root, real] = await Promise.all([realpath(ctx.privateDir), realpath(notes).catch(() => undefined)]);
          const rel = real === undefined ? "" : relative(root, real);
          if (real === undefined || !rel || rel === ".." || rel.startsWith(`..${sep}`)) throw new Error("sharing:preservation");
        }
        ctx.guard();
        await deps.withdrawShares?.();
        ctx.guard();
      },
      remove: async pairing => {
        ctx.guard();
        if (deps.remove) await deps.remove(pairing, ctx.layout);
        else {
          await ctx.build(pairing, true);
          // Nothing published before Turn off may reappear when the site is turned back on (G3).
          await ctx.writePublished([]);
        }
        ctx.guard();
      },
      step: step => { ctx.guard(); deps.step?.(step); },
    });
    current = { root: ctx.root, service: setup };
    return setup;
  };
  return {
    describe: () => service().describe(),
    enable: (name: string) => serial(async () => {
      const ctx = bound(), before = await ctx.read().catch(() => undefined);
      const result = await service().enable(name);
      // D-429: the shares moved into the public repository; the old separate site is emptied so its links stop, in the background.
      if (before && before.phase !== "off" && result.from === `${before.owner}/${before.name}`) void retire(before).catch(() => {});
      return result;
    }),
    disable: () => serial(() => deps.removalLane ? deps.removalLane(() => service().disable()) : service().disable()),
    async pairing(): Promise<SitePairing | undefined> { return bound().current(); },
    publish: (): Promise<void> => serial(async () => {
      const ctx = bound(), saved = await ctx.current();
      if (!saved || saved.phase !== "ready") throw new Error("access:site.unavailable");
      try { await ctx.build(saved); } catch (error) { throw publishProblem(error); }
    }),
    /**
     * Takes down whatever is no longer shared or published (D-428, D-429): rebuilds the project's one public site from
     * the current records (access.json, published.json, or the public notes/ in the Private + Public layout) and pushes
     * it in one non-forced commit, leak-checked, then waits for Pages. Remove the grant, the record or the file first.
     */
    takeDown: (): Promise<PublicDeploy> => serial(async () => {
      const ctx = bound(), saved = await ctx.current();
      if (!saved || saved.phase !== "ready") throw new Error("sharing:unconfigured");
      try { return await ctx.build(saved); } catch (error) { throw publishProblem(error); }
    }),
    /** D-430: the website's saved look, or undefined while none is chosen. */
    appearance: async (): Promise<SiteLook | undefined> => readSiteLook(siteLookFile(bound().privateDir)),
    /**
     * D-430: saves the website's look and rebuilds the one public site with it, like `takeDown`: published pages and
     * the shared notes' page take it together. A failure leaves the saved look, so Retry builds it again.
     */
    setAppearance: (look: unknown): Promise<PublicDeploy> => serial(async () => {
      if (!isSiteLook(look)) throw new Error("sharing:scope");
      const ctx = bound(), saved = await ctx.current();
      if (!saved || saved.phase !== "ready") throw new Error("sharing:unconfigured");
      deps.step?.("save");
      await ctx.writeLook({ theme: look.theme, font: look.font });
      try { return await ctx.build(saved); } catch (error) { throw publishProblem(error); }
    }),
    /** D-429: the old separate site (`owner/name`) whose shares moved into the public repository, until it's deleted on GitHub. */
    async oldSite(): Promise<string | undefined> {
      const saved = await bound().current();
      return saved?.phase === "ready" ? saved.from : undefined;
    },
    /**
     * D-429: the owner deletes the old site on GitHub (D-413's way, never from the app). It counts as gone only when
     * GitHub answers 404 for it while the same session still reads the account; then the pairing forgets it.
     */
    checkOldSite: (): Promise<boolean> => serial(async () => {
      const ctx = bound(), saved = await ctx.current();
      if (!saved?.from) return true;
      const api = await deps.api();
      if (!api) throw new Error("sharing:signedout");
      const [owner, name] = saved.from.split("/") as [string, string];
      try {
        if (await api.findRepo(owner, name)) return false;
        await api.user();
      } catch (error) { throw publishProblem(error); }
      ctx.guard();
      const { from: _, ...rest } = saved;
      await ctx.store.write(rest);
      return true;
    }),
    /** Notes on the current public site (G3). */
    published: async (): Promise<string[]> => bound().readPublished(),
    /** The running Publish or Unpublish, if any, so a reopened dialog follows it (G3.5). */
    publishing: () => tasks?.pending(),
    publishNotes: (selection: ConfirmedSelection) => publicTasks().publish(selection),
    unpublishNotes: (paths: readonly string[]) => publicTasks().unpublish(paths),
    /**
     * D-423: a published note (or a folder with published notes) renamed or moved inside the notes follows the
     * rename. Its recorded path changes at once, so no later deploy can drop it, then one deploy publishes it at
     * the new path and removes the old page, with the usual staging and leak check. A failure leaves the old
     * page live, with Retry; nothing is ever silently unpublished.
     */
    async followRename(from: string, to: string): Promise<void> {
      const ctx = bound(), notes = ctx.layout.privateNotes;
      if (!notes || ctx.layout.legacy) return;
      const rel = (p: string) => { const r = relative(notes, p); return !r || r === ".." || r.startsWith(`..${sep}`) || isAbsolute(r) ? undefined : r.split(sep).join("/"); };
      const a = rel(from), b = rel(to);
      if (!a || !b || a === b) return;
      const paths = await serial(async () => {
        const current = await ctx.readPublished();
        const next = current.map(p => p === a ? b : p.startsWith(`${a}/`) ? `${b}${p.slice(a.length)}` : p);
        const moved = next.filter((p, i) => p !== current[i]);
        if (moved.length) await ctx.writePublished([...new Set(next)].sort());
        return moved;
      });
      if (paths.length) await deployFollow(paths);
    },
    /** Retry of a rename's deploy that failed or never went live: the recorded notes, at their current paths. */
    followRetry: () => deployFollow(lastFollow),
  };
  /**
   * D-429: after the shares moved, the old separate site (D-425) is published empty, so its share links stop and
   * nothing there can be read again. It's the old site's own target; the owner deletes the repository on GitHub.
   */
  async function retire(old: SitePairing): Promise<void> {
    const directory = await mkdtemp(join(deps.temporary, "retired-site-"));
    try {
      const artifact = await publish({ site: directory, owner: old.owner, siteUrl: old.site });
      const push = deps.retirePublisher ?? (deps.publisher ? undefined : pagesArtifactPublisher({
        api: deps.api, get, target: async project => project === old.project ? old : undefined,
      }));
      if (push) await push(old.project, { directory, build: artifact.build });
    } finally { await rm(directory, { recursive: true, force: true }); }
  }
  function deployFollow(paths: string[]): Promise<void> {
    lastFollow = paths;
    return serial(async () => {
      try {
        const ctx = bound(), saved = await ctx.current();
        // Not set up (or turned off meanwhile): the record already follows, and there's no site to update.
        if (!saved || saved.phase !== "ready") return;
        const { pending } = await ctx.build(saved, false, { notes: await ctx.presentPublished() });
        deps.renameFollowed?.(pending ? { paths, status: "pending", build: pending } : { paths, status: "live" });
      } catch (error) {
        const problem = publishProblem(error);
        deps.renameFollowed?.({ paths, status: "failed", problem: problem instanceof Error ? problem.message : "sharing:failed" });
      }
    });
  }
  function publicTasks() {
    const ctx = bound();
    if (ctx.layout.legacy) throw new Error("sharing:unavailable");
    if (tasks && tasksRoot === ctx.root) return tasks;
    tasksRoot = ctx.root;
    return tasks = publicPublishing({
      current: ctx.presentPublished,
      // Recorded inside the lane, below, before the next build can read the list (D-436).
      record: async () => {},
      // In the same lane as setup, removal and sharing pushes, so they never interleave on the site.
      deploy: (paths, selection) => serial(async () => {
        const saved = await ctx.current();
        if (!saved || saved.phase !== "ready") throw new Error("sharing:unavailable");
        let deployed: PublicDeploy;
        try { deployed = await ctx.build(saved, false, { ...selection, notes: [...paths] }); }
        catch (error) { throw publishProblem(error); }
        // D-436: a share update or another build queued behind this one reads the list this deploy put on the site,
        // never the one before it (Publish B then a share update dropped B, 27 November).
        await ctx.writePublished(paths);
        return deployed;
      }),
      step: step => deps.publishStep?.(step),
    });
  }
}
