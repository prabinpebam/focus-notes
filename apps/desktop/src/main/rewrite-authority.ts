import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { NoteWriter, RewriteSaveLease } from "./note-write.ts";
import type { OriginalInput } from "./rewrite-original.ts";
import { basename, dirname, join } from "node:path";
import { createRewriteFile } from "./rewrite-new-file.ts";

export interface CurrentRewriteNote {
  path: string;
  workspace: string;
  domain: "public" | "private" | "local";
  noteKey: string;
  conflict: boolean;
}
interface Current {
  revision: string;
  note: CurrentRewriteNote;
  diskExpectedHash?: string;
  abort: AbortController;
  operation?: { token: string; lease: RewriteSaveLease; target: string; input: OriginalInput; checkpointId?: string; variationId?: string; output?: string; streaming?: boolean; complete?: boolean };
}
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const refused = () => new Error("rewrite-stale");
interface Options {
  writer: NoteWriter;
  resolve(path: string): Promise<CurrentRewriteNote>;
  original(input: OriginalInput, note: CurrentRewriteNote): Promise<string>;
  variation?(input: OriginalInput, checkpointId: string, replacement: string, note: CurrentRewriteNote): Promise<string>;
  history?(note: CurrentRewriteNote): Promise<{ source: string; original?: string }[]>;
}

/** Explicit navigation, not reads, establishes authority. No renderer domain/key is accepted. */
export class RewriteAuthority {
  readonly #windows = new Map<number, Current>();
  readonly #options: Options;
  constructor(options: Options) { this.#options = options; }
  written(owner: number, path: string, content: string): void {
    const current = this.#windows.get(owner);
    if (current?.note?.path === path) current.diskExpectedHash = hash(content);
  }
  cancel(owner: number, revision: string): void {
    const current = this.#live(owner, revision);
    current.abort.abort();
    current.operation?.lease.release();
    current.operation = undefined;
    current.abort = new AbortController();
  }
  close(owner: number): void {
    const current = this.#windows.get(owner);
    this.#windows.delete(owner);
    current?.abort.abort();
    current?.operation?.lease.release();
  }
  closeAll(): void { for (const owner of this.#windows.keys()) this.close(owner); }
  async activate(owner: number, path: string | null, expected?: string): Promise<string | undefined> {
    this.close(owner);
    if (path === null) return;
    // Reserve BEFORE awaiting resolution so late navigation cannot overwrite a newer one.
    const current: Current = { revision: randomUUID(), note: undefined!, abort: new AbortController() };
    this.#windows.set(owner, current);
    try {
      current.note = await this.#options.resolve(path);
      const disk = await readFile(current.note.path, "utf8");
      if (expected !== undefined && disk !== expected) throw refused();
      current.diskExpectedHash = hash(disk);
      this.#live(owner, current.revision);
      if (current.note.conflict) throw refused();
      return current.revision;
    } catch (error) {
      if (this.#windows.get(owner) === current) this.close(owner);
      throw error;
    }
  }
  #live(owner: number, revision: string): Current {
    const current = this.#windows.get(owner);
    if (!current || current.revision !== revision || current.abort.signal.aborted) throw refused();
    return current;
  }
  /** Read-only candidate preview. Identity and unchanged baseline are main-owned. */
  async history(owner: number, revision: string, source: string): Promise<{ source: string; original?: string }[]> {
    const current = this.#live(owner, revision);
    const check = async () => {
      const note = await this.#options.resolve(current.note.path);
      if (this.#live(owner, revision) !== current || note.path !== current.note.path || note.conflict || note.workspace !== current.note.workspace
        || note.noteKey !== current.note.noteKey || note.domain !== current.note.domain
        || hash(source) !== current.diskExpectedHash
        || hash(await readFile(note.path, "utf8")) !== current.diskExpectedHash) throw refused();
      if (this.#live(owner, revision) !== current) throw refused();
    };
    await check();
    const results = await this.#options.history?.(current.note);
    await check();
    if (!results || results.length > 20 || results.reduce((bytes, item) => bytes + Buffer.byteLength(item.source) + Buffer.byteLength(item.original ?? ""), 0) > 2 * 1024 * 1024) throw refused();
    return results;
  }
  /** Full-document reconciliation only: never reuse historical target offsets. */
  async restore(owner: number, revision: string, source: string, index: number, original: boolean): Promise<{ token: string; source: string }> {
    if (!Number.isSafeInteger(index) || index < 0 || typeof original !== "boolean") throw refused();
    const saved = (await this.history(owner, revision, source))[index];
    if (!saved || typeof saved.original !== "string"
      || (source !== saved.original && source !== saved.source)) throw refused();
    const replacement = original ? saved.original : saved.source;
    if (replacement === source || !source.length) throw refused();
    const token = await this.prepare(owner, revision, source, {
      from: 0, to: source.length, startByte: 0, endByte: Buffer.byteLength(source), original: source, expanded: false,
    });
    try {
      await this.history(owner, revision, source);
      this.#operation(owner, token).operation.variationId = "persisted-history";
      return { token, source: replacement };
    } catch (error) { this.release(owner, token); throw error; }
  }
  async prepare(owner: number, revision: string, source: string, target: OriginalInput["target"]): Promise<string> {
    const current = this.#live(owner, revision);
    const signal = current.abort.signal;
    if (!current.note || current.operation || typeof source !== "string" || source.length > 32 * 1024 * 1024) throw refused();
    const note = current.note;
    // Only the source/coordinates are editor input. Path, domain, key and baseline are main-owned.
    const diskExpectedHash = current.diskExpectedHash!;
    this.#live(owner, revision);
    const lease = await this.#options.writer.prepareRewrite(note.path, {
      domain: note.domain, noteKey: note.noteKey, baselineHash: diskExpectedHash, signal,
    });
    const input: OriginalInput = { domain: note.domain === "public" ? "public" : "private",
      noteKey: note.noteKey, sessionId: randomUUID(), diskExpectedHash, source, target: { ...target } };
    const operation: NonNullable<Current["operation"]> = { token: randomUUID(), lease, target: target.original, input };
    try {
      if (signal.aborted) throw refused();
      this.#live(owner, revision);
      current.operation = operation;
      const ack = await this.#options.original(input, note);
      if (!ack || this.#live(owner, revision).operation !== operation) throw refused();
      operation.checkpointId = ack;
      return operation.token;
    } catch (error) {
      lease.release();
      if (current.operation === operation) current.operation = undefined;
      throw error;
    }
  }
  #operation(owner: number, token: string): { current: Current; operation: NonNullable<Current["operation"]> } {
    const current = this.#windows.get(owner);
    if (!current || current.abort.signal.aborted || !current.operation || current.operation.token !== token) throw refused();
    return { current, operation: current.operation };
  }
  target(owner: number, token: string): string { return this.#operation(owner, token).operation.target; }
  signal(owner: number, token: string): AbortSignal { return this.#operation(owner, token).current.abort.signal; }
  streamStart(owner: number, token: string): void {
    const { operation } = this.#operation(owner, token);
    if (operation.streaming) throw refused();
    operation.streaming = true; operation.output = ""; operation.complete = false;
  }
  streamEvent(owner: number, token: string, event: { type: string; text?: string }): void {
    const { operation } = this.#operation(owner, token);
    if (event.type === "delta") {
      operation.output += event.text ?? "";
      if (Buffer.byteLength(operation.output!) > 32768) throw refused();
    } else if (event.type === "complete") operation.complete = true;
  }
  async complete(owner: number, token: string, replacement: string): Promise<string> {
    const { current, operation } = this.#operation(owner, token);
    if (!operation.checkpointId || operation.variationId || typeof replacement !== "string"
      || (operation.streaming && (!operation.complete || operation.output !== replacement))) throw refused();
    const id = await this.#options.variation?.(operation.input, operation.checkpointId, replacement, current.note);
    if (!id || this.#operation(owner, token).operation !== operation) throw refused();
    operation.variationId = id;
    return id;
  }
  async accept(owner: number, token: string): Promise<void> {
    const { current, operation } = this.#operation(owner, token);
    if (this.#options.variation && !operation.variationId) throw refused();
    const note = await this.#options.resolve(current.note.path);
    if (note.path !== current.note.path || note.workspace !== current.note.workspace || note.noteKey !== current.note.noteKey || note.domain !== current.note.domain
      || note.conflict || hash(await readFile(note.path, "utf8")) !== operation.lease.baselineHash) throw refused();
    this.#operation(owner, token);
    this.release(owner, token);
  }
  async newFile(owner: number, token: string, name: string): Promise<string> {
    const { current, operation } = this.#operation(owner, token);
    if (typeof name !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9 _-]{0,79}\.md$/.test(name)
      || basename(name) !== name || !operation.complete || !operation.variationId || !operation.output
      || operation.input.target.startByte !== 0 || operation.input.target.endByte !== Buffer.byteLength(operation.input.source)
      || hash(operation.input.source) !== operation.lease.baselineHash) throw refused();
    const validate = async () => {
      if (this.#operation(owner, token).operation !== operation) throw refused();
      if ([...this.#windows.entries()].some(([id, other]) => id !== owner && other.note?.path === current.note.path)) throw refused();
      const note = await this.#options.resolve(current.note.path);
      if (note.path !== current.note.path || note.domain !== current.note.domain || note.noteKey !== current.note.noteKey
        || note.workspace !== current.note.workspace || note.conflict
        || hash(await readFile(note.path, "utf8")) !== operation.lease.baselineHash) throw refused();
      this.#operation(owner, token);
    };
    const path = join(dirname(current.note.path), name);
    await createRewriteFile(path, operation.output, validate);
    this.release(owner, token);
    return path;
  }
  release(owner: number, token: string): void {
    const { current, operation } = this.#operation(owner, token);
    current.operation = undefined;
    operation.lease.release();
  }
}
