import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import type { GitHubApi } from "@focus-notes/github";
import { publish } from "@focus-notes/seal/publish";
import type { SharingLayout } from "./layout.ts";
import { configurePublicSite, publishSealedArtifact, requirePublishedArtifact, type SealedArtifactPublisher } from "./site.ts";
import { sharingSetup, sitePairingStore, type SharingSetupStep, type SitePairing } from "./setup.ts";

export function sharingRuntime(deps: {
  root(): string;
  layout(): SharingLayout;
  api(): Promise<GitHubApi | undefined>;
  repository(dir: string): Promise<string | undefined>;
  write(file: string, text: string): Promise<void>;
  written(file: string): void;
  temporary: string;
  publisher?: SealedArtifactPublisher;
  /** Must hold the source write lane through verified preservation and deployed removal. */
  removalLane?<T>(work: () => Promise<T>): Promise<T>;
  preserve?(layout: SharingLayout): Promise<void>;
  remove?(pairing: SitePairing, layout: SharingLayout): Promise<void>;
  step?(step: SharingSetupStep): void;
}) {
  let current: { root: string; service: ReturnType<typeof sharingSetup> } | undefined;
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
    const build = async (pairing: SitePairing) => {
      guard();
      const directory = await mkdtemp(join(deps.temporary, "sealed-site-"));
      try {
        const artifact = await publish({
          private: privateDir,
          ...(layout.publicDir ? { notes: join(layout.publicDir, "notes") } : {}),
          site: directory, owner: pairing.owner, siteUrl: pairing.site,
        });
        guard();
        deps.step?.("push");
        const sealed = { directory, build: artifact.build };
        const result = await (deps.publisher ?? publishSealedArtifact)(pairing.project, sealed);
        guard();
        requirePublishedArtifact(result, pairing, sealed);
      } finally { await rm(directory, { recursive: true, force: true }); }
    };
    return { root, layout, privateDir, guard, store, read, build };
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
  };
}
