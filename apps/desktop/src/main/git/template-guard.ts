/**
 * A template repository is never someone's notes (D-147, D-157). Before D-147, "We found your
 * notes" listed the public template; opening it, the app committed and pushed someone's notes to it.
 * This guard is asked at every way in (clone or open from GitHub, open a folder, switching
 * workspace, setup's steps) and before every push, so no route can write notes to a template.
 *
 * A repository is a template when it's one of the known templates (any letter case, no network) or
 * GitHub says `is_template`. GitHub's answer is kept for the session; when GitHub can't answer
 * (offline, signed out), the last good answer stands, and a repository never known as a template
 * isn't one: normal saving is never blocked by an unknown answer.
 */

/** The template repository instances are made from (D-88). */
export const TEMPLATE = { owner: "prabinpebam", name: "focus-notes-workspace" } as const;
export interface RepoRef { owner: string; name: string }
export const KNOWN_TEMPLATES: readonly RepoRef[] = [TEMPLATE];

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
/** One of the known templates, whatever the letter case. */
export const knownTemplate = (owner: string, name: string, known: readonly RepoRef[] = KNOWN_TEMPLATES) => known.some((t) => same(t.owner, owner) && same(t.name, name));

const SEGMENT = /^[A-Za-z0-9._-]{1,100}$/;
const ref = (owner: string | undefined, name: string | undefined): RepoRef | undefined => {
  const n = name?.replace(/\.git$/i, "");
  return owner && n && SEGMENT.test(owner) && SEGMENT.test(n) ? { owner, name: n } : undefined;
};
const slashes = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "");

/**
 * The GitHub repository a remote points to: `https://github.com/o/n(.git)`, `git@github.com:o/n.git`,
 * `ssh://git@github.com/o/n.git`. With `localBase` (the journeys' bare remotes, never packaged), a
 * remote at `<localBase>/o/n.git` too. Anything else is undefined: not GitHub, so not a template.
 */
export function remoteRepo(url: string, localBase?: string): RepoRef | undefined {
  const u = url.trim();
  const scp = /^[^@/\s]+@github\.com:\/?([^/]+)\/([^/]+?)\/?$/i.exec(u);
  if (scp) return ref(scp[1], scp[2]);
  const web = /^(?:https?|ssh|git):\/\/(?:[^@/]+@)?github\.com(?::\d+)?\/([^/]+)\/([^/]+?)\/?$/i.exec(u);
  if (web) return ref(web[1], web[2]);
  if (localBase) {
    const base = slashes(localBase).toLowerCase();
    const p = slashes(u.replace(/^file:\/\//i, ""));
    if (p.toLowerCase().startsWith(`${base}/`)) {
      const parts = p.slice(base.length + 1).split("/");
      if (parts.length === 2) return ref(parts[0], parts[1]);
    }
  }
  return undefined;
}

export type TemplateAnswer = "template" | "notTemplate" | "unknown";

export interface TemplateGuardOptions {
  /** GitHub's `is_template` for a repository; undefined (or a throw) when it can't say. */
  lookup: (owner: string, name: string) => Promise<boolean | undefined>;
  known?: readonly RepoRef[];
  /** The journeys' local bare remotes (see `remoteRepo`). */
  localBase?: string;
  /** How long GitHub's answer is used before asking again. Default: 10 minutes. */
  freshMs?: number;
  /** How long GitHub gets to answer before the last good answer is used. Default: 10 s. */
  timeoutMs?: number;
  now?: () => number;
}

export class TemplateGuard {
  readonly #o: TemplateGuardOptions;
  readonly #cache = new Map<string, { template: boolean; at: number }>();

  constructor(o: TemplateGuardOptions) {
    this.#o = o;
  }

  async check(owner: string, name: string): Promise<TemplateAnswer> {
    if (knownTemplate(owner, name, this.#o.known)) return "template";
    const key = `${owner}/${name}`.toLowerCase();
    const now = this.#o.now ?? Date.now;
    const kept = this.#cache.get(key);
    if (!kept || now() - kept.at >= (this.#o.freshMs ?? 10 * 60_000)) {
      let answer: boolean | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        answer = await Promise.race([
          this.#o.lookup(owner, name),
          new Promise<undefined>((r) => (timer = setTimeout(() => r(undefined), this.#o.timeoutMs ?? 10_000))),
        ]);
      } catch {
        answer = undefined;
      } finally {
        clearTimeout(timer);
      }
      if (answer !== undefined) this.#cache.set(key, { template: answer, at: now() });
    }
    const v = this.#cache.get(key);
    return v === undefined ? "unknown" : v.template ? "template" : "notTemplate";
  }

  /** Whether a repository is a template: only a known template or GitHub's yes, never an unknown answer. */
  async isTemplateRepo(owner: string, name: string): Promise<boolean> {
    return (await this.check(owner, name)) === "template";
  }

  /** Whether a remote's URL is a template repository on GitHub. */
  async isTemplateRemote(url: string): Promise<boolean> {
    const r = remoteRepo(url, this.#o.localBase);
    return r ? this.isTemplateRepo(r.owner, r.name) : false;
  }
}
