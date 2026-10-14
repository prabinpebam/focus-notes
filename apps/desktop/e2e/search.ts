/**
 * Asks the search index in the app's own worker (WP-4.1), for journeys before Spotlight (WP-4.2)
 * has a panel to type into. The question is handed to the worker as if the app had sent it, and
 * the answer taken before it's posted back, so nothing is added to the app for tests.
 */
import { expect, type Page, type Worker } from "@playwright/test";
import type { SearchQuery, SearchResults } from "../../../packages/core/src/search/types.ts";

/** The search index's worker, once the app has started it. */
export async function searchWorker(page: Page): Promise<Worker> {
  await expect.poll(() => page.workers().some((w) => /\/worker[-\w]*\.(js|ts)/.test(w.url())), { timeout: 15_000 }).toBe(true);
  return page.workers().find((w) => /\/worker[-\w]*\.(js|ts)/.test(w.url()))!;
}

export function ask(worker: Worker, query: SearchQuery): Promise<SearchResults> {
  return worker.evaluate((q) => {
    const scope = globalThis as unknown as { postMessage: (m: unknown) => void; dispatchEvent: (e: Event) => boolean };
    const own = scope.postMessage;
    const id = -1 - Math.floor(Math.random() * 1e9);
    return new Promise<SearchResults>((resolve, reject) => {
      scope.postMessage = (m: unknown) => {
        const r = m as { type: string; id: number; results: SearchResults; message: string };
        if (r.id !== id) return own.call(scope, m);
        if (r.type === "result") resolve(r.results);
        else reject(new Error(r.message));
      };
      try {
        // Handled at once, after every change the worker has taken in so far.
        scope.dispatchEvent(new MessageEvent("message", { data: { type: "query", id, query: q } }));
      } finally {
        scope.postMessage = own;
      }
    });
  }, query);
}

/** The keys of the hits for a query. */
export const keysOf = async (worker: Worker, query: SearchQuery) => (await ask(worker, query)).hits.map((h) => h.key);
