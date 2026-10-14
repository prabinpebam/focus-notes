/**
 * Starts the search worker in the app (both shells). The Content Security Policy requires Trusted
 * Types for scripts (SEC-02), and a worker's address is a script URL: the `search-worker` policy
 * passes exactly one, the worker the build made, on this page's own origin, and refuses any other.
 */
import { connectSearch } from "./protocol.ts";
import type { SearchIndexClient } from "./types.ts";

/** The Trusted Types policy the CSP allows for the worker's address (`trusted-types … search-worker`). */
export const SEARCH_WORKER_POLICY = "search-worker";

interface ScriptUrlPolicy { createScriptURL(url: string): unknown }
interface TrustedTypesLike { createPolicy(name: string, rules: { createScriptURL: (url: string) => string }): ScriptUrlPolicy }

let policy: { policy: ScriptUrlPolicy; allowed: string } | undefined;

/** The worker's address as the page may use it: checked by the policy where Trusted Types exist. */
export function workerScriptUrl(url: string, base: string, tt?: TrustedTypesLike): unknown {
  const resolved = new URL(url, base);
  const page = new URL(base);
  if (resolved.protocol !== page.protocol || resolved.host !== page.host) throw new Error("The search worker must come from the app itself");
  if (!tt) return resolved.href;
  if (!policy) {
    const allowed = resolved.href;
    policy = {
      allowed,
      policy: tt.createPolicy(SEARCH_WORKER_POLICY, {
        createScriptURL: (u: string) => {
          if (u !== allowed) throw new TypeError("Only the search worker may be loaded");
          return u;
        },
      }),
    };
  }
  return policy.policy.createScriptURL(resolved.href);
}

/**
 * The index in a module worker. `url` is the worker's built file (the shells import it with Vite's
 * `?worker&url`). Call it after the app is ready: building never delays the first caret.
 */
export function createSearchWorker(url: string): SearchIndexClient {
  const g = globalThis as unknown as { trustedTypes?: TrustedTypesLike; location: { href: string } };
  const script = workerScriptUrl(url, g.location.href, g.trustedTypes);
  const worker = new Worker(script as string, { type: "module", name: "focus-notes-search" });
  return connectSearch(worker, () => worker.terminate());
}
