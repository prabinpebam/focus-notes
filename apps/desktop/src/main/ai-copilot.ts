import { CopilotClient, RuntimeConnection, type CopilotSession, type SessionEvent } from "@github/copilot-sdk";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, realpath, rm, stat } from "node:fs/promises";
import { delimiter, isAbsolute, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import type { AiFound } from "@focus-notes/core/ai-providers";
import { AiError, type AiLimits } from "./ai-rewrite.ts";

const exec = promisify(execFile);
const SUPPORTED_VERSION = "1.0.105";
const MAX_ANSWER = 64 * 1024;
interface Binary { path: string; args?: string[] }
export interface CopilotOptions {
  /** Internal seam for protocol tests, never taken from renderer input or saved settings. */
  binary?: () => Promise<Binary | undefined>;
}

export function copilotEnvironment(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {};
  for (const key of Object.keys(process.env)) {
    if (/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|HOMEDRIVE|HOMEPATH|APPDATA|LOCALAPPDATA|PROGRAMDATA|PROGRAMFILES|PROGRAMFILES\(X86\)|HTTPS?_PROXY|NO_PROXY|NODE_EXTRA_CA_CERTS|SSL_CERT_FILE)$/i.test(key)) env[key] = process.env[key];
  }
  env.COPILOT_AUTO_UPDATE = "false";
  env.COPILOT_OTEL_ENABLED = "false";
  env.OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT = "false";
  return env;
}

async function installedBinary(): Promise<Binary | undefined> {
  const name = process.platform === "win32" ? "copilot.exe" : "copilot";
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    const dir = directory.replace(/^"(.*)"$/, "$1");
    if (!isAbsolute(dir) || resolve(dir) === resolve(process.cwd()) || /copilot-shim/i.test(dir)) continue;
    try {
      const path = await realpath(join(dir, name));
      if ((await stat(path)).isFile()) return { path };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT" && (error as NodeJS.ErrnoException).code !== "ENOTDIR") throw new AiError("connection-unavailable");
    }
  }
  return undefined;
}

function failure(error: unknown): AiError {
  if (error instanceof AiError) return error;
  const message = error instanceof Error ? error.message : "";
  if (/quota|rate.?limit|429|credits|premium requests/i.test(message)) return new AiError("rate-limited");
  if (/auth|sign.?in|401|403|token/i.test(message)) return new AiError("cli-not-signed-in");
  return new AiError("provider-error");
}

export class CopilotIntegration {
  readonly #binary: () => Promise<Binary | undefined>;
  constructor(options: CopilotOptions = {}) {
    this.#binary = options.binary ?? installedBinary;
  }

  async #open(signal: AbortSignal) {
    signal.throwIfAborted();
    const binary = await this.#binary();
    if (!binary) throw new AiError("cli-missing");
    const env = copilotEnvironment();
    try {
      const version = await exec(binary.path, [...binary.args ?? [], "--version", "--no-auto-update"], { env, windowsHide: true, timeout: 2000, maxBuffer: 4096, signal });
      if (!new RegExp(`\\b${SUPPORTED_VERSION.replaceAll(".", "\\.")}\\b`).test(version.stdout)) throw new AiError("cli-unsupported");
    } catch (error) {
      if (signal.aborted) throw signal.reason;
      if (error instanceof AiError) throw error;
      throw new AiError((error as NodeJS.ErrnoException).code === "ENOENT" ? "cli-missing" : "cli-unsupported");
    }
    signal.throwIfAborted();
    const root = await mkdtemp(join(tmpdir(), "focus-notes-copilot-"));
    const cwd = join(root, "empty");
    const state = join(root, "state");
    let client: CopilotClient | undefined;
    let session: CopilotSession | undefined;
    let stop: Promise<void> | undefined;
    const forceStop = () => {
      if (client && !stop) {
        const ownedClient = client;
        stop = (async () => {
          let timer: ReturnType<typeof setTimeout> | undefined;
          try {
            if (session) await Promise.race([
              session.abort(),
              new Promise<void>((r) => { timer = setTimeout(r, 1000); }),
            ]);
          } finally {
            clearTimeout(timer);
            await ownedClient.forceStop();
          }
        })();
      }
      return stop;
    };
    const onAbort = () => { void forceStop()?.catch(() => {}); };
    const close = async () => {
      signal.removeEventListener("abort", onAbort);
      if (stop) await stop;
      else if (client) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          const errors = await Promise.race([
            client.stop(),
            new Promise<Error[]>((r) => { timer = setTimeout(() => r([new Error("shutdown-timeout")]), 3000); }),
          ]);
          if (errors.length) await client.forceStop();
        } finally {
          clearTimeout(timer);
        }
      }
      await rm(root, { recursive: true, force: true });
    };
    try {
      await mkdir(cwd);
      await mkdir(state);
      signal.throwIfAborted();
      client = new CopilotClient({
        connection: RuntimeConnection.forStdio({ path: binary.path, args: [...binary.args ?? [], "--disable-builtin-mcps", "--sync-session=off"] }),
        workingDirectory: cwd,
        baseDirectory: state,
        mode: "empty",
        useLoggedInUser: true,
        logLevel: "none",
        env,
      });
      signal.addEventListener("abort", onAbort, { once: true });
      await client.start();
      signal.throwIfAborted();
      const auth = await client.getAuthStatus();
      signal.throwIfAborted();
      if (!auth.isAuthenticated) throw new AiError("cli-not-signed-in");
      return { client, state, close, trackSession: (created: CopilotSession) => { session = created; } };
    } catch (error) {
      await close();
      throw signal.aborted ? signal.reason : failure(error);
    }
  }

  async discover(outer?: AbortSignal): Promise<AiFound | undefined> {
    const started = performance.now();
    const controller = new AbortController();
    const abort = () => controller.abort(new AiError("cancelled"));
    outer?.addEventListener("abort", abort, { once: true });
    if (outer?.aborted) abort();
    const timer = setTimeout(() => controller.abort(new AiError("timeout")), 5000);
    let close: (() => Promise<void>) | undefined;
    try {
      const runtime = await this.#open(controller.signal);
      close = runtime.close;
      return { provider: "copilot-cli", endpoint: "", models: [{ id: "auto", cloud: true }], status: "signed-in" };
    } catch (error) {
      outer?.throwIfAborted();
      const e = failure(error);
      if (e.code === "cli-missing") return undefined;
      return { provider: "copilot-cli", endpoint: "", models: [], status: e.code === "cli-not-signed-in" ? "signed-out" : e.code === "cli-unsupported" ? "unsupported-version" : "unknown", error: e.code };
    } finally {
      outer?.removeEventListener("abort", abort);
      clearTimeout(timer);
      await close?.();
      performance.measure("fn:ai.cliDiscover", { start: started, duration: performance.now() - started });
    }
  }

  async models(): Promise<{ id: string; cloud: boolean }[]> {
    const started = performance.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new AiError("timeout")), 8000);
    let close: (() => Promise<void>) | undefined;
    try {
      const runtime = await this.#open(controller.signal);
      close = runtime.close;
      const models = await runtime.client.listModels();
      return [{ id: "auto", cloud: true }, ...models.slice(0, 499).map((m) => ({ id: m.id, cloud: true }))];
    } catch (error) {
      throw controller.signal.aborted ? controller.signal.reason : failure(error);
    } finally {
      clearTimeout(timer);
      await close?.();
      performance.measure("fn:ai.models", { start: started, duration: performance.now() - started });
    }
  }

  async *stream(system: string, prompt: string, model: string, outer: AbortSignal, limits: AiLimits): AsyncGenerator<string> {
    const controller = new AbortController();
    const abort = () => controller.abort(new AiError("cancelled"));
    outer.addEventListener("abort", abort, { once: true });
    if (outer.aborted) abort();
    const timeout = () => controller.abort(new AiError("timeout"));
    const total = setTimeout(timeout, limits.total);
    let idle = setTimeout(timeout, limits.response);
    let close: (() => Promise<void>) | undefined;
    let session: CopilotSession | undefined;
    let wake: (() => void) | undefined;
    const queue: string[] = [];
    const streamed = new Set<string>();
    const finished = new Set<string>();
    let terminal = false, complete = false, size = 0, visible = false;
    let error: AiError | undefined;
    const fail = (e: AiError) => {
      error ??= e;
      wake?.();
      controller.abort(e);
    };
    const push = (text: string) => {
      size += text.length;
      if (size > MAX_ANSWER) return fail(new AiError("too-long"));
      visible ||= Boolean(text.trim());
      queue.push(text);
      clearTimeout(idle);
      idle = setTimeout(timeout, limits.idle);
      wake?.();
    };
    const event = (e: SessionEvent) => {
      if (controller.signal.aborted) return;
      if (e.type === "assistant.message_delta") {
        if (typeof e.data.deltaContent !== "string") return fail(new AiError("provider-format"));
        streamed.add(e.data.messageId);
        push(e.data.deltaContent);
      } else if (e.type === "assistant.message") {
        if (typeof e.data.content !== "string") return fail(new AiError("provider-format"));
        terminal = true;
        if (!streamed.has(e.data.messageId) && !finished.has(e.data.messageId)) push(e.data.content);
        finished.add(e.data.messageId);
      } else if (e.type === "session.idle") {
        complete = true;
        wake?.();
      } else if (e.type === "session.error") fail(failure(new Error(`${e.data.errorType} ${e.data.message}`)));
      else if (e.type.startsWith("tool.execution")) fail(new AiError("provider-format"));
    };
    const onAbort = () => wake?.();
    controller.signal.addEventListener("abort", onAbort);
    try {
      const runtime = await this.#open(controller.signal);
      close = runtime.close;
      session = await runtime.client.createSession({
        model: model === "auto" ? undefined : model,
        streaming: true,
        availableTools: [], tools: [], mcpServers: {},
        enableConfigDiscovery: false,
        configDirectory: runtime.state,
        infiniteSessions: { enabled: false },
        systemMessage: { mode: "replace", content: system },
        onPermissionRequest: () => {
          fail(new AiError("provider-format"));
          return { kind: "denied-by-rules", rules: [] };
        },
        hooks: { onPreToolUse: () => {
          fail(new AiError("provider-format"));
          return { permissionDecision: "deny" };
        } },
        onEvent: event,
      });
      runtime.trackSession(session);
      await session.rpc.tools.initializeAndValidate();
      const tools = await session.rpc.tools.getCurrentMetadata();
      if (!Array.isArray(tools.tools) || tools.tools.length) throw new AiError("provider-format");
      controller.signal.throwIfAborted();
      await session.send({ prompt });
      while (true) {
        controller.signal.throwIfAborted();
        if (error) throw error;
        if (queue.length) yield queue.shift()!;
        else if (complete) break;
        else await new Promise<void>((r) => { wake = r; });
      }
      if (!terminal) throw new AiError("provider-format");
      if (!visible) throw new AiError("provider-empty");
    } catch (e) {
      throw error ?? (controller.signal.aborted ? controller.signal.reason : failure(e));
    } finally {
      clearTimeout(total);
      clearTimeout(idle);
      outer.removeEventListener("abort", abort);
      controller.signal.removeEventListener("abort", onAbort);
      if (!complete && !controller.signal.aborted) controller.abort(new AiError("cancelled"));
      await close?.();
    }
  }
}
