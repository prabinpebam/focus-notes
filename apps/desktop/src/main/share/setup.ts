import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { GitHubError, type GitHubApi } from "@focus-notes/github";
import { isRepoName } from "@focus-notes/core/setup";
import type { SharingSetupPhase, SharingSetupPreview, SharingSetupStep } from "@focus-notes/core";
export type { SharingSetupPreview, SharingSetupStep } from "@focus-notes/core";

export interface SitePairing {
  version: 1;
  project: string;
  owner: string;
  name: string;
  intent: string;
  phase: SharingSetupPhase;
  site: string;
}
const fail = (code: string) => new Error(`sharing:${code}`);
const phases: SitePairing["phase"][] = ["reserved", "creating", "created", "ready", "removing", "off"];
function setupProblem(error: unknown): Error {
  if (error instanceof Error && /^sharing:[a-z]+$/.test(error.message)) return error;
  if (error instanceof GitHubError) return fail(error.status === 0 ? "offline" : error.unauthorized ? "signedout" :
    error.rateLimited ? "ratelimited" : error.status === 403 ? "refused" : "failed");
  return fail("failed");
}

export function parseSitePairing(raw: unknown): SitePairing {
  if (!raw || typeof raw !== "object") throw fail("record");
  const value = raw as Partial<SitePairing>;
  const phase = phases.find(phase => phase === value.phase);
  if (value.version !== 1 || typeof value.project !== "string" || !/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(value.project) ||
    typeof value.owner !== "string" || !/^[A-Za-z0-9-]+$/.test(value.owner) || typeof value.name !== "string" || !isRepoName(value.name) ||
    typeof value.intent !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value.intent) || !phase ||
    typeof value.site !== "string" || value.site !== siteAddress(value.owner, value.name)) throw fail("record");
  return { version: 1, project: value.project, owner: value.owner, name: value.name, intent: value.intent, phase, site: value.site };
}

export function siteAddress(owner: string, name: string): string {
  const host = owner.toLowerCase();
  return name.toLowerCase() === `${host}.github.io` ? `https://${host}.github.io/` : `https://${host}.github.io/${name}/`;
}

export function sitePairingStore(file: string, atomicWrite: (file: string, text: string) => Promise<void>) {
  return {
    async read(): Promise<SitePairing | undefined> {
      let text: string;
      try { text = await readFile(file, "utf8"); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
        throw fail("record");
      }
      try {
        if (text.length > 16_384) throw fail("record");
        return parseSitePairing(JSON.parse(text));
      } catch { throw fail("record"); }
    },
    async write(pairing: SitePairing): Promise<void> {
      await atomicWrite(file, `${JSON.stringify(parseSitePairing(pairing), null, 2)}\n`);
    },
  };
}

export function sharingSetup(deps: {
  api(): Promise<GitHubApi | undefined>;
  project(): Promise<string | undefined>;
  read(): Promise<SitePairing | undefined>;
  write(pairing: SitePairing): Promise<void>;
  /** Desktop-only sealing and initial reader output. Never uploads private source or credentials. */
  initialize(pairing: SitePairing, step: (step: SharingSetupStep) => void): Promise<void>;
  /** Copy working public notes/media privately, verifying the copies before returning. */
  preserve(pairing: SitePairing): Promise<void>;
  /** Publish removal and remove legacy private-reader credentials; never delete a repository. */
  remove(pairing: SitePairing): Promise<void>;
  step?(step: SharingSetupStep): void;
}) {
  let pending: { key: string; promise: Promise<SitePairing> } | undefined;
  const step = (value: SharingSetupStep) => deps.step?.(value);
  const context = async () => {
    step("check");
    const project = await deps.project();
    if (!project || !/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(project)) throw fail("unlinked");
    const api = await deps.api();
    if (!api) throw fail("signedout");
    const [owner, name] = project.split("/") as [string, string];
    const user = await api.user();
    if (user.login.toLowerCase() !== owner.toLowerCase()) throw fail("owner");
    const repo = await api.repo(owner, name);
    if (!repo.private || repo.template) throw fail("unlinked");
    if (!repo.canAdmin) throw fail("refused");
    const saved = await deps.read();
    const pairing = saved ? parseSitePairing(saved) : undefined;
    if (pairing && pairing.project !== project) throw fail("changed");
    return { project, api, owner: user.login, pairing };
  };
  const run = (key: string, action: () => Promise<SitePairing>) => {
    if (pending) return pending.key === key ? pending.promise : Promise.reject(fail("busy"));
    const promise = action().catch(error => { throw setupProblem(error); }).finally(() => { pending = undefined; });
    pending = { key, promise };
    return promise;
  };
  return {
    async describe(): Promise<SharingSetupPreview> {
      try {
        const { project, owner, pairing } = await context();
        const name = pairing?.name ?? "notes-site";
        return { project, owner, name, site: pairing?.site ?? siteAddress(owner, name), phase: pairing?.phase ?? "unconfigured" };
      } catch (error) { throw setupProblem(error); }
    },
    enable(name: string): Promise<SitePairing> {
      return run(`enable:${name.toLowerCase()}`, async () => {
        if (!isRepoName(name)) throw fail("name");
        const ctx = await context();
        if (name.toLowerCase() === ctx.project.split("/")[1]!.toLowerCase()) throw fail("name");
        let pairing = ctx.pairing;
        if (pairing && pairing.name !== name) {
          if (pairing.phase !== "reserved") throw fail("changed");
          pairing = undefined;
        }
        if (pairing?.phase === "removing") throw fail("removing");
        if (pairing?.phase === "ready") return pairing;
        if (!pairing) {
          pairing = { version: 1, project: ctx.project, owner: ctx.owner, name, intent: randomUUID(), phase: "reserved", site: siteAddress(ctx.owner, name) };
          await deps.write(pairing);
        }
        const marker = `Focus Notes site ${pairing.intent}`;
        let repo = await ctx.api.findRepo(pairing.owner, pairing.name);
        if (repo && (repo.private || repo.template || !repo.canAdmin || !repo.canPush)) throw fail("refused");
        if (repo && (pairing.phase === "reserved" || pairing.phase === "creating") && repo.description !== marker) throw fail("taken");
        if (!repo) {
          if (pairing.phase !== "reserved" && pairing.phase !== "creating") throw fail("missing");
          pairing = { ...pairing, phase: "creating" };
          await deps.write(pairing);
          step("create");
          await ctx.api.createRepo(pairing.name, marker, false);
          repo = await ctx.api.repo(pairing.owner, pairing.name);
          if (repo.private || repo.template || !repo.canAdmin || repo.description !== marker) throw fail("refused");
        }
        if (pairing.phase === "reserved" || pairing.phase === "creating") {
          pairing = { ...pairing, phase: "created" };
          await deps.write(pairing);
        }
        // An off site stays empty: enabling must never republish its previous items.
        if (pairing.phase !== "off") {
          step("prepare");
          await deps.initialize(pairing, step);
        }
        step("pages");
        const pages = await ctx.api.pages(pairing.owner, pairing.name);
        if (!pages || pages.buildType !== "workflow") await ctx.api.usePagesWorkflow(pairing.owner, pairing.name, Boolean(pages));
        pairing = { ...pairing, phase: "ready" };
        await deps.write(pairing);
        step("ready");
        return pairing;
      });
    },
    disable(): Promise<SitePairing> {
      return run("disable", async () => {
        const { pairing } = await context();
        if (!pairing) throw fail("unconfigured");
        if (pairing.phase === "off") return pairing;
        if (pairing.phase !== "ready" && pairing.phase !== "removing") throw fail("incomplete");
        step("preserve");
        await deps.preserve(pairing);
        const removing: SitePairing = { ...pairing, phase: "removing" };
        await deps.write(removing);
        step("remove");
        await deps.remove(removing);
        const off: SitePairing = { ...removing, phase: "off" };
        await deps.write(off);
        return off;
      });
    },
  };
}
