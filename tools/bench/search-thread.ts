/**
 * The search worker on a Node worker thread, for the benchmark and the worker test (SPT-07): the
 * same code as the app's Web Worker (packages/core/src/search/worker.ts), on the same engine (V8).
 */
import { parentPort } from "node:worker_threads";
import { serveSearch } from "../../packages/core/src/search/serve.ts";
import type { PortLike } from "../../packages/core/src/search/protocol.ts";

if (!parentPort) throw new Error("Run this as a worker thread");
serveSearch(parentPort as unknown as PortLike);
