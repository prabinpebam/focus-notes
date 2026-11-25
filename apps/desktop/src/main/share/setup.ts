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
  /** The separate site (`owner/name`) this pairing replaced when its shares moved into the project's own public repository (D-429). */
  from?: string;
}
const fail = (code: string) => new Error(`sharing:${code}`);
const DEFAULT_SITE = "notes-site";
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
    typeof value.site !== "string" || value.site !== siteAddress(value.owner, value.name) ||
    value.from !== undefined && (typeof value.from !== "string" || !/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(value.from))) throw fail("record");
  return { version: 1, project: value.project, owner: value.owner, name: value.name, intent: value.intent, phase, site: value.site, ...(value.from ? { from: value.from } : {}) };
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

/**
 * Ours to adopt: any Focus Notes site marker or our site manifest, or, under the default name only, an empty
 * repository (no files beyond GitHub's starter README). An empty repository with any other name stays someone else's.
 */
async function adoptable(api: GitHubApi, owner: string, name: string, repo: { description?: string; defaultBranch: string }): Promise<boolean> {
  if (/^Focus Notes site [a-f0-9-]{36}$/.test(repo.description ?? "")) return true;
  if (await api.hasFile(owner, name, "site/focus-notes.json")) return true;
  if (name.toLowerCase() !== DEFAULT_SITE) return false;
  const head = await api.head(owner, name, repo.defaultBranch);
  if (!head) return true;
  const listing = await api.tree(owner, name, await api.commitTree(owner, name, head));
  return !listing.truncated && listing.entries.every(entry => entry.path === "README.md");
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
  /**
   * The project's own public repository (`owner/name`), in the Private + Public layout: its site is the one site,
   * holding published pages and sealed shares side by side, and no other repository is ever made (D-429).
   */
  site?(): Promise<string | undefined>;
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
    const site = deps.site ? await deps.site() : undefined;
    if (deps.site && !site) throw fail("unlinked");
    const fixed = site ? site.split("/") as [string, string] : undefined;
    if (fixed && (fixed.length !== 2 || fixed[0].toLowerCase() !== owner.toLowerCase() || !isRepoName(fixed[1]))) throw fail("owner");
    return { project, api, owner: user.login, pairing, fixed: fixed?.[1] };
  };
  const run = (key: string, action: () => Promise<SitePairing>) => {
    if (pending) return pending.key === key ? pending.promise : Promise.reject(fail("busy"));
    const promise = action().catch(error => { throw setupProblem(error); }).finally(() => { pending = undefined; });
    pending = { key, promise };
    return promise;
  };
  /**
   * Private + Public layout (D-429): the project's own public repository is the site. It must already exist, be
   * public and be this account's to administer; nothing is ever created. A pairing with an older separate site
   * (D-425) is replaced, remembering it in `from` so its shares can be taken down and its deletion offered.
   */
  const enableFixed = async (ctx: Awaited<ReturnType<typeof context>>, name: string): Promise<SitePairing> => {
    const same = ctx.pairing && ctx.pairing.name.toLowerCase() === name.toLowerCase() ? ctx.pairing : undefined;
    const moving = ctx.pairing && !same && ctx.pairing.phase !== "off" ? ctx.pairing : undefined;
    let pairing = same;
    if (pairing?.phase === "removing") throw fail("removing");
    if (pairing?.phase === "ready") return pairing;
    const repo = await ctx.api.findRepo(ctx.owner, name);
    if (!repo) throw fail("missing");
    if (repo.private || repo.template || !repo.canAdmin || !repo.canPush) throw fail("refused");
    if (!pairing || pairing.phase === "reserved" || pairing.phase === "creating") {
      const from = moving ? `${moving.owner}/${moving.name}` : pairing?.from ?? ctx.pairing?.from;
      pairing = {
        version: 1, project: ctx.project, owner: ctx.owner, name, intent: pairing?.intent ?? randomUUID(), phase: "created",
        site: siteAddress(ctx.owner, name), ...(from ? { from } : {}),
      };
      await deps.write(pairing);
    }
    // Every share was withdrawn at Turn off, so building again can't republish one; the published pages come back.
    step("prepare");
    await deps.initialize(pairing, step);
    step("pages");
    const pages = await ctx.api.pages(pairing.owner, pairing.name);
    if (!pages || pages.buildType !== "workflow") await ctx.api.usePagesWorkflow(pairing.owner, pairing.name, Boolean(pages));
    pairing = { ...pairing, phase: "ready" };
    await deps.write(pairing);
    step("ready");
    return pairing;
  };
  return {
    async describe(): Promise<SharingSetupPreview> {
      try {
        const { project, owner, pairing, fixed } = await context();
        // A pairing with another site in the Private + Public layout is the old separate site (D-425): it moves (D-429).
        const current = pairing && (!fixed || pairing.name.toLowerCase() === fixed.toLowerCase()) ? pairing : undefined;
        const name = fixed ?? pairing?.name ?? DEFAULT_SITE;
        return {
          project, owner, name, site: current?.site ?? siteAddress(owner, name), phase: current?.phase ?? "unconfigured",
          ...(fixed ? { existing: true } : {}),
          ...(pairing && !current ? { moveFrom: `${pairing.owner}/${pairing.name}` } : {}),
        };
      } catch (error) { throw setupProblem(error); }
    },
    enable(requested: string): Promise<SitePairing> {
      return run(`enable:${requested.toLowerCase()}`, async () => {
        if (!isRepoName(requested)) throw fail("name");
        const ctx = await context();
        if (ctx.fixed) return enableFixed(ctx, ctx.fixed);
        const name = requested;
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
        // A site this account already made with Focus Notes (another pairing, or a lost record), or an empty
        // repository, is adopted; anything else under that name stays someone else's.
        if (repo && (pairing.phase === "reserved" || pairing.phase === "creating") && repo.description !== marker && !await adoptable(ctx.api, pairing.owner, pairing.name, repo)) throw fail("taken");
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
