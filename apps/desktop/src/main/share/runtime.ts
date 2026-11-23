import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import type { GitHubApi } from "@focus-notes/github";
import { publish, type PublishOptions } from "@focus-notes/seal/publish";
import type { SharingLayout } from "./layout.ts";
import { publicPublishing, type PublicTaskStep } from "./public-publishing.ts";
import { stagePublicSelection, type ConfirmedSelection } from "./public-selection.ts";
import { configurePublicSite, publishSealedArtifact, requirePublishedArtifact, type SealedArtifactPublisher } from "./site.ts";
import { sharingSetup, sitePairingStore, type SharingSetupStep, type SitePairing } from "./setup.ts";

/** Notes on the current public site, by notes-root-relative path (G3). Recorded only after their deploy. */
function parsePublished(text: string): string[] {
  const value = JSON.parse(text) as { version?: unknown; notes?: unknown };
  if (value.version !== 1 || !Array.isArray(value.notes) || value.notes.some(n => typeof n !== "string")) throw new Error("sharing:record");
  return value.notes as string[];
}

export function sharingRuntime(deps: {
  root(): string;
  layout(): SharingLayout;
  api(): Promise<GitHubApi | undefined>;
  repository(dir: string): Promise<string | undefined>;
  write(file: string, text: string): Promise<void>;
  written(file: string): void;
  temporary: string;
  publisher?: SealedArtifactPublisher;
  /** The live publisher for Publish and sharing pushes only; it never makes site setup available. */
  live?: SealedArtifactPublisher;
  /** The page renderer's folder (`render.mjs`, `assets/`): plaintext Publish needs its pages for Copy link. */
  reader?(): string | undefined;
  publishStep?(step: PublicTaskStep): void;
  /** Must hold the source write lane through verified preservation and deployed removal. */
  removalLane?<T>(work: () => Promise<T>): Promise<T>;
  preserve?(layout: SharingLayout): Promise<void>;
  remove?(pairing: SitePairing, layout: SharingLayout): Promise<void>;
  step?(step: SharingSetupStep): void;
}) {
  let current: { root: string; service: ReturnType<typeof sharingSetup> } | undefined;
  let tasks: ReturnType<typeof publicPublishing> | undefined, tasksRoot: string | undefined;
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
    const build = async (pairing: SitePairing, how: "setup" | "publish" = "publish", selection?: ConfirmedSelection): Promise<string> => {
      guard();
      const notes = layout.legacy ? [] : selection?.notes ?? await readPublished();
      const reader = notes.length ? deps.reader?.() : undefined;
      if (notes.length && (!reader || !layout.privateNotes)) throw new Error("sharing:unavailable");
      const directory = await mkdtemp(join(deps.temporary, "sealed-site-"));
      const staging = notes.length ? await mkdtemp(join(deps.temporary, "public-notes-")) : undefined;
      try {
        if (staging) await stagePublicSelection({ notesRoot: layout.privateNotes!, selection: { ...selection, notes }, staging });
        guard();
        // `published`: the confirmed notes are public on purpose; every other private note stays leak-checked.
        const options: PublishOptions & { published?: string[] } = {
          private: privateDir,
          ...(staging ? { notes: staging, published: [...notes], reader: reader! } : layout.publicDir ? { notes: join(layout.publicDir, "notes") } : {}),
          site: directory, owner: pairing.owner, siteUrl: pairing.site,
        };
        const artifact = await publish(options);
        guard();
        deps.step?.("push");
        const sealed = { directory, build: artifact.build };
        const result = await ((how === "publish" ? deps.live : undefined) ?? deps.publisher ?? publishSealedArtifact)(pairing.project, sealed);
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
        await ctx.build(pairing, "setup");
      },
      preserve: async () => {
        if (!deps.preserve || !deps.removalLane) throw new Error("sharing:unavailable");
        ctx.guard();
        await deps.preserve(ctx.layout);
        ctx.guard();
      },
      remove: async pairing => {
        ctx.guard();
        if (!deps.remove) throw new Error("sharing:unavailable");
        await deps.remove(pairing, ctx.layout);
        ctx.guard();
      },
      step: step => { ctx.guard(); deps.step?.(step); },
    });
    current = { root: ctx.root, service: setup };
    return setup;
  };
  return {
    describe: () => service().describe(),
    // Do not create a public repository when production cannot complete its initial deployment.
    enable: (name: string) => deps.publisher ? service().enable(name) : Promise.reject(new Error("sharing:unavailable")),
    disable: () => deps.removalLane ? deps.removalLane(() => service().disable()) : Promise.reject(new Error("sharing:unavailable")),
    async pairing(): Promise<SitePairing | undefined> { return bound().read(); },
    async publish(): Promise<void> {
      const ctx = bound(), saved = await ctx.read();
      if (!saved || saved.phase !== "ready") throw new Error("access:site.unavailable");
      await ctx.build(saved);
    },
    /** Notes on the current public site (G3). */
    published: async (): Promise<string[]> => bound().readPublished(),
    /** The running Publish or Unpublish, if any, so a reopened dialog follows it (G3.5). */
    publishing: () => tasks?.pending(),
    publishNotes: (selection: ConfirmedSelection) => publicTasks().publish(selection),
    unpublishNotes: (paths: readonly string[]) => publicTasks().unpublish(paths),
  };
  function publicTasks() {
    const ctx = bound();
    if (ctx.layout.legacy || !deps.live) throw new Error("sharing:unavailable");
    if (tasks && tasksRoot === ctx.root) return tasks;
    tasksRoot = ctx.root;
    return tasks = publicPublishing({
      current: ctx.readPublished,
      record: ctx.writePublished,
      deploy: async (paths, selection) => {
        const saved = await ctx.read();
        if (!saved || saved.phase !== "ready") throw new Error("sharing:unavailable");
        return ctx.build(saved, "publish", { ...selection, notes: [...paths] });
      },
      step: step => deps.publishStep?.(step),
    });
  }
}
