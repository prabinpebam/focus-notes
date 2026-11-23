import { copyFile, mkdir, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { GitHubError, type GitHubApi } from "@focus-notes/github";
import { publish } from "@focus-notes/seal/publish";
import type { SharingLayout } from "./layout.ts";
import { publicPublishing, type PublicTaskStep } from "./public-publishing.ts";
import { stagePublicSelection, type ConfirmedSelection } from "./public-selection.ts";
import { configurePublicSite, requirePublishedArtifact, type SealedArtifactPublisher } from "./site.ts";
import { pagesArtifactPublisher, type DeployedSiteGet } from "./site-publish.ts";
import { sharingSetup, sitePairingStore, type SharingSetupStep, type SitePairing } from "./setup.ts";

/** Notes on the current public site, by notes-root-relative path (G3). Recorded only after their deploy. */
function parsePublished(text: string): string[] {
  const value = JSON.parse(text) as { version?: unknown; notes?: unknown };
  if (value.version !== 1 || !Array.isArray(value.notes) || value.notes.some(n => typeof n !== "string")) throw new Error("sharing:record");
  return value.notes as string[];
}
/** A Publish or Unpublish problem as a plain `sharing:<code>`; leak-check failures keep their own (content-free) message. */
function publishProblem(error: unknown): unknown {
  if (!(error instanceof GitHubError)) return error;
  return new Error(`sharing:${error.status === 0 ? "offline" : error.unauthorized ? "signedout"
    : error.status === 403 || error.status === 404 ? "refused" : "failed"}`);
}

export function sharingRuntime(deps: {
  root(): string;
  layout(): SharingLayout;
  api(): Promise<GitHubApi | undefined>;
  repository(dir: string): Promise<string | undefined>;
  write(file: string, text: string): Promise<void>;
  written(file: string): void;
  temporary: string;
  /** Defaults to pushing the sealed artifact to the paired public site and waiting for Pages. */
  publisher?: SealedArtifactPublisher;
  /** The deployed site's fetch, for the default publisher. */
  get?: DeployedSiteGet;
  /** A legacy pair's public source must be held through verified preservation and deployed removal. */
  removalLane?<T>(work: () => Promise<T>): Promise<T>;
  preserve?(layout: SharingLayout): Promise<void>;
  remove?(pairing: SitePairing, layout: SharingLayout): Promise<void>;
  step?(step: SharingSetupStep): void;
  /** The page renderer's folder (`render.mjs`, `assets/`): plaintext Publish needs its pages for Copy link. */
  reader?(): string | undefined;
  publishStep?(step: PublicTaskStep): void;
}) {
  let current: { root: string; service: ReturnType<typeof sharingSetup> } | undefined;
  let tasks: ReturnType<typeof publicPublishing> | undefined, tasksRoot: string | undefined;
  // Publishing, setup and removal never interleave, so a share can't redeploy a site being turned off.
  let lane: Promise<unknown> = Promise.resolve();
  const serial = <T>(work: () => Promise<T>): Promise<T> => {
    const next = lane.then(work, work);
    lane = next.catch(() => {});
    return next;
  };
  const publisher = deps.publisher ?? pagesArtifactPublisher({
    api: deps.api,
    target: async project => { const saved = await bound().read(); return saved?.project === project ? saved : undefined; },
    ...(deps.get ? { get: deps.get } : {}),
  });
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
    const publishedFile = join(privateDir, ".focus-notes", "published.json");
    const readPublished = async (): Promise<string[]> => {
      guard();
      let text: string;
      try { text = await readFile(publishedFile, "utf8"); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
      guard();
      return parsePublished(text);
    };
    const writePublished = async (notes: readonly string[]) => {
      guard();
      await deps.write(publishedFile, `${JSON.stringify({ version: 1, notes }, null, 2)}\n`);
      guard();
      deps.written(publishedFile);
    };
    /** Seals and deploys the site with the recorded published notes, or `selection` for a Publish or Unpublish (G3). */
    const build = async (pairing: SitePairing, empty = false, selection?: ConfirmedSelection): Promise<string> => {
      guard();
      const notes = empty || layout.legacy ? [] : selection?.notes ?? await readPublished();
      const reader = notes.length ? deps.reader?.() : undefined;
      if (notes.length && (!reader || !layout.privateNotes)) throw new Error("sharing:unavailable");
      const directory = await mkdtemp(join(deps.temporary, "sealed-site-"));
      const staging = notes.length ? await mkdtemp(join(deps.temporary, "public-notes-")) : undefined;
      try {
        const selected = staging ? await stagePublicSelection({ notesRoot: layout.privateNotes!, selection: { ...selection, notes }, staging }) : undefined;
        guard();
        // Removal deploys an empty site: no public notes, no vault and no share keyrings.
        const artifact = await publish(empty ? { site: directory, owner: pairing.owner, siteUrl: pairing.site } : {
          private: privateDir,
          // `published`: the confirmed notes are public on purpose; every other private note stays leak-checked.
          ...(staging ? { notes: staging, published: [...notes], reader: reader! } : layout.publicDir ? { notes: join(layout.publicDir, "notes") } : {}),
          site: directory, owner: pairing.owner, siteUrl: pairing.site,
        });
        // Stripped images sit beside the published notes, so the notes' relative links resolve (WP-9.9).
        for (const image of selected?.media ?? []) {
          const to = join(directory, "notes", ...image.split("/"));
          await mkdir(dirname(to), { recursive: true });
          await copyFile(join(staging!, ...image.split("/")), to);
        }
        guard();
        deps.step?.("push");
        if (selection) deps.publishStep?.("publishing");
        const sealed = { directory, build: artifact.build };
        const result = await publisher(pairing.project, sealed);
        guard();
        requirePublishedArtifact(result, pairing, sealed);
        return result.status === "published" ? result.commit : "";
      } finally {
        await rm(directory, { recursive: true, force: true });
        if (staging) await rm(staging, { recursive: true, force: true });
      }
    };
    return { root, layout, privateDir, guard, store, read, build, readPublished, writePublished };
  };
  const service = () => {
    const ctx = bound();
    if (current?.root === ctx.root) return current.service;
    const setup = sharingSetup({
      api: async () => { ctx.guard(); const api = await deps.api(); ctx.guard(); return api; },
      project: async () => { ctx.guard(); const repo = await deps.repository(ctx.privateDir); ctx.guard(); return repo; },
      read: ctx.read, write: ctx.store.write,
      initialize: async (pairing, step) => {
        ctx.guard();
        const api = await deps.api();
        if (!api) throw new Error("sharing:signedout");
        ctx.guard();
        await configurePublicSite(api, pairing, step);
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
        if (ctx.layout.publicDir) {
          // A legacy pair's public source needs the caller's write lane and its own preservation.
          if (!deps.preserve || !deps.removalLane) throw new Error("sharing:unavailable");
          await deps.preserve(ctx.layout);
        } else if (deps.preserve) await deps.preserve(ctx.layout);
        else {
          // Working notes and media already live only in the private project; removal never touches them.
          const notes = ctx.layout.privateNotes;
          if (!notes) throw new Error("sharing:preservation");
          const [root, real] = await Promise.all([realpath(ctx.privateDir), realpath(notes).catch(() => undefined)]);
          const rel = real === undefined ? "" : relative(root, real);
          if (real === undefined || !rel || rel === ".." || rel.startsWith(`..${sep}`)) throw new Error("sharing:preservation");
        }
        ctx.guard();
      },
      remove: async pairing => {
        ctx.guard();
        if (deps.remove) await deps.remove(pairing, ctx.layout);
        else if (ctx.layout.publicDir) throw new Error("sharing:unavailable");
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
    enable: (name: string) => serial(() => service().enable(name)),
    disable: () => serial(() => deps.removalLane ? deps.removalLane(() => service().disable()) : service().disable()),
    async pairing(): Promise<SitePairing | undefined> { return bound().read(); },
    publish: (): Promise<void> => serial(async () => {
      const ctx = bound(), saved = await ctx.read();
      if (!saved || saved.phase !== "ready") throw new Error("access:site.unavailable");
      await ctx.build(saved);
    }),
    /** Notes on the current public site (G3). */
    published: async (): Promise<string[]> => bound().readPublished(),
    /** The running Publish or Unpublish, if any, so a reopened dialog follows it (G3.5). */
    publishing: () => tasks?.pending(),
    publishNotes: (selection: ConfirmedSelection) => publicTasks().publish(selection),
    unpublishNotes: (paths: readonly string[]) => publicTasks().unpublish(paths),
  };
  function publicTasks() {
    const ctx = bound();
    if (ctx.layout.legacy) throw new Error("sharing:unavailable");
    if (tasks && tasksRoot === ctx.root) return tasks;
    tasksRoot = ctx.root;
    return tasks = publicPublishing({
      current: ctx.readPublished,
      record: ctx.writePublished,
      // In the same lane as setup, removal and sharing pushes, so they never interleave on the site.
      deploy: (paths, selection) => serial(async () => {
        const saved = await ctx.read();
        if (!saved || saved.phase !== "ready") throw new Error("sharing:unavailable");
        try { return await ctx.build(saved, false, { ...selection, notes: [...paths] }); }
        catch (error) { throw publishProblem(error); }
      }),
      step: step => deps.publishStep?.(step),
    });
  }
}
