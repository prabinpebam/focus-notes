/**
 * The search index (WP-4.1, SPT-07, SPT-08): the typed API, the feed from the workspace, and the
 * worker client. The engine itself (MiniSearch) loads only in the worker: `@focus-notes/core/search-worker`.
 */
export * from "./types.ts";
export * from "./feed.ts";
export * from "./client.ts";
export { connectSearch, NO_STATUS, type PortLike, type ToWorker, type FromWorker } from "./protocol.ts";
