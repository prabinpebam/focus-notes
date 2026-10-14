/**
 * The search worker's entry (Spotlight → Index and privacy): the index runs here, off the thread
 * that draws and types. It has no network code and reads nothing but its messages.
 */
import { serveSearch } from "./serve.ts";
import type { PortLike } from "./protocol.ts";

serveSearch(globalThis as unknown as PortLike);
