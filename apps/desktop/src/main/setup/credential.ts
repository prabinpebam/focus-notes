/**
 * The GitHub token, from Git's own credential helper (Desktop and Git → Getting API access, SEC-03):
 * `git credential fill` for github.com with prompts off. The token comes back on standard output,
 * is kept in memory by the caller, and is never written, logged, or put in a process argument.
 */
import type { GitRunner } from "../git/run.ts";

/** The question Git's helper answers: only the protocol and host, never a username or password. */
export const CREDENTIAL_QUERY = "protocol=https\nhost=github.com\n\n";

/** The token, or undefined when no helper has a GitHub credential (the person isn't signed in). */
export async function githubToken(git: GitRunner, cwd: string): Promise<string | undefined> {
  const r = await git({ cwd, args: ["credential", "fill"], input: CREDENTIAL_QUERY, timeoutMs: 30_000 });
  if (r.code !== 0) return undefined;
  for (const line of r.stdout.split(/\r?\n/)) if (line.startsWith("password=") && line.length > 9) return line.slice(9);
  return undefined;
}

/** The API's fetch: requests may go only to api.github.com, whatever a caller asks (PRV-01). */
export const GITHUB_TIMEOUT_MS = 10_000;

export const githubFetch = (base: (input: string, init?: RequestInit) => Promise<Response> = (i, init) => fetch(i, init)) =>
  (input: string, init?: RequestInit): Promise<Response> => {
    if (!input.startsWith("https://api.github.com/")) return Promise.reject(new Error("Only api.github.com may be called"));
    const timeout = AbortSignal.timeout(GITHUB_TIMEOUT_MS);
    const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    return base(input, { ...init, redirect: "error", signal });
  };
