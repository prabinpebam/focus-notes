/** Starts the search worker on a Node worker thread and connects to it, as the app does with a Web Worker. */
import { Worker } from "node:worker_threads";
import { connectSearch } from "../../packages/core/src/search/protocol.ts";
import type { SearchIndexClient } from "../../packages/core/src/search/types.ts";

export function searchThread(): SearchIndexClient & { thread: Worker } {
  const thread = new Worker(new URL("./search-thread.ts", import.meta.url));
  const client = connectSearch({
    postMessage: (m) => thread.postMessage(m),
    addEventListener: (_type, listener) => void thread.on("message", (data: unknown) => listener({ data })),
  }, () => void thread.terminate());
  return Object.assign(client, { thread });
}
