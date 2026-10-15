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
 * What a remote's URL points to, as far as the app can tell (HIGH-2):
 * - `repo`: owner and name. `github` when the host is GitHub (`github.com`, `www.`, `ssh.` on any
 *   port) or could be an SSH alias for it (`git@alias:o/n.git`, `github-personal:o/n`,
 *   `ssh://alias/o/n`), so GitHub is asked; credentials and a trailing `/` or `.git` are ignored.
 * - `other`: an HTTP(S) or Git host that isn't GitHub. `local`: a folder on this computer.
 * - `unreadable`: anything else, including a GitHub (or alias) path that isn't exactly owner/name.
 * With `localBase` (the journeys' bare remotes, never packaged), `<localBase>/o/n.git` is a repo too.
 */
export type RemoteKind = { kind: "repo"; owner: string; name: string; github: boolean } | { kind: "other" } | { kind: "local" } | { kind: "unreadable" };
const GITHUB_HOST = /^(?:www\.|ssh\.)?github\.com$/i;
const repoOf = (path: string, github: boolean): RemoteKind => {
  const parts = path.replace(/\/+$/, "").replace(/^\/+/, "").split("/");
  const r = parts.length === 2 ? ref(parts[0], parts[1]) : undefined;
  return r ? { kind: "repo", ...r, github } : { kind: "unreadable" };
};
export function readRemote(url: string, localBase?: string): RemoteKind {
  const u = url.trim();
  if (!u) return { kind: "unreadable" };
  const local = /^file:\/\//i.test(u) || /^[A-Za-z]:[\\/]/.test(u) || /^(?:[\\/]|\.\.?[\\/])/.test(u) || !/[:@]/.test(u);
  if (local) {
    if (localBase) {
      const base = slashes(localBase).toLowerCase();
      const p = slashes(u.replace(/^file:\/\//i, ""));
      if (p.toLowerCase().startsWith(`${base}/`)) return repoOf(p.slice(base.length + 1), true);
    }
    return { kind: "local" };
  }
  const withScheme = /^([a-z][a-z0-9+.-]*):\/\/(?:[^/]*@)?([^/:]*)(?::\d*)?(\/.*)?$/i.exec(u);
  if (withScheme) {
    const [, scheme, host, path] = withScheme;
    if (!host) return { kind: "unreadable" };
    if (GITHUB_HOST.test(host)) return repoOf(path ?? "", true);
    // An SSH host may be an alias for GitHub (~/.ssh/config); a web host that isn't GitHub isn't.
    return /^(?:ssh|git\+ssh|ssh\+git)$/i.test(scheme!) ? repoOf(path ?? "", true) : { kind: "other" };
  }
  // scp-like `[user@]host:path`: GitHub, or an SSH alias for it.
  const scp = /^(?:[^@/]+@)?([^/:]+):(.*)$/.exec(u);
  return scp ? repoOf(scp[2]!, true) : { kind: "unreadable" };
}

/** A GitHub repository a remote points to (`readRemote`'s `repo` on GitHub or an alias), or undefined. */
export function remoteRepo(url: string, localBase?: string): RepoRef | undefined {
  const r = readRemote(url, localBase);
  return r.kind === "repo" && r.github ? { owner: r.owner, name: r.name } : undefined;
}

/** Whether a known template's name is anywhere in a URL as a whole name (any case, any owner or host). */
export function namesKnownTemplate(url: string, known: readonly RepoRef[] = KNOWN_TEMPLATES): boolean {
  const u = url.replace(/\\/g, "/").toLowerCase();
  return known.some((k) => {
    const n = k.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^|[/:])${n}(?:\\.git)?(?:/|$)`).test(u);
  });
}

/** Whether a push may go to a remote (D-157): `template` and `unreadable` are refused. */
export type RemoteVerdict = "ok" | "template" | "unreadable";

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

  /**
   * Whether a push may go to a remote's URL: a known template's name anywhere in it, or GitHub's
   * `is_template` for a repository on GitHub (or an SSH alias for it), is `template`; a URL it
   * can't read as owner/name is `unreadable` (HIGH-2). Another host, or a folder here, is `ok`.
   */
  async checkRemote(url: string): Promise<RemoteVerdict> {
    if (namesKnownTemplate(url, this.#o.known)) return "template";
    const r = readRemote(url, this.#o.localBase);
    if (r.kind === "unreadable") return "unreadable";
    if (r.kind !== "repo") return "ok";
    if (knownTemplate(r.owner, r.name, this.#o.known)) return "template";
    return r.github && (await this.isTemplateRepo(r.owner, r.name)) ? "template" : "ok";
  }

  /** Whether a remote's URL is a template repository (an unreadable one isn't; `checkRemote` refuses it). */
  async isTemplateRemote(url: string): Promise<boolean> {
    return (await this.checkRemote(url)) === "template";
  }
}
