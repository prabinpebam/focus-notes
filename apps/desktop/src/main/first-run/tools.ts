/**
 * Git's sign-in helpers as programs (Desktop and Git → Sign-in, D-21): finding Git Credential
 * Manager and the GitHub CLI, and running them with an argument list, never a shell command line.
 * Their arguments are fixed words: no token, name, or path is ever passed to them (SEC-03).
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { delimiter, extname, join } from "node:path";

export interface ToolCall {
  args: string[];
  input?: string;
  cwd?: string;
  timeoutMs?: number;
  /** The process's environment: the caller's, with prompts that would hang the app turned off. */
  env?: NodeJS.ProcessEnv;
  /** Output as it arrives, for a device code. */
  onOutput?: (text: string) => void;
}
export interface ToolResult {
  /** The exit code; -1 when it couldn't start, timed out, or was stopped. */
  code: number;
  stdout: string;
  stderr: string;
  killed: boolean;
}
export interface ToolProcess {
  done: Promise<ToolResult>;
  kill(): void;
}
export type ToolRunner = (program: string, call: ToolCall) => ToolProcess;

const isFile = async (p: string) => {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
};

/**
 * A program on PATH (then in `extraDirs`), as the system would find it: on Windows with PATHEXT's
 * extensions (gh.exe, or a gh.cmd shim from a package manager). Every place is checked at once, off
 * the main thread: one at a time, synchronously, a long PATH took the main process 40 ms (D-151 (5)).
 */
export async function findProgram(name: string, env: NodeJS.ProcessEnv, extraDirs: string[] = [], win = process.platform === "win32"): Promise<string | undefined> {
  const path = env.PATH ?? env.Path ?? "";
  const dirs = [...path.split(delimiter), ...extraDirs].filter(Boolean);
  const exts = win ? (env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean).map((e) => e.toLowerCase()) : [""];
  const places = dirs.flatMap((dir) => exts.map((ext) => join(dir.replace(/^"|"$/g, ""), name + ext)));
  const found = await Promise.all(places.map(isFile));
  // The first in PATH's order, as the system would pick.
  return places[found.indexOf(true)];
}

/** Words a helper may be given: letters, digits, and URL-ish punctuation. Never spaces, quotes, or shell characters. */
const SAFE_ARG = /^[A-Za-z0-9_.:/=@+-]+$/;

/** How to start a program: directly, or a Windows batch shim through cmd.exe with only safe words. */
export function commandFor(program: string, args: string[], env: NodeJS.ProcessEnv, win = process.platform === "win32"): { file: string; args: string[]; verbatim: boolean } {
  for (const a of args) if (!SAFE_ARG.test(a)) throw new Error("Refused: a helper's argument isn't a plain word");
  const ext = extname(program).toLowerCase();
  if (win && (ext === ".cmd" || ext === ".bat")) {
    if (/["%^&|<>]/.test(program)) throw new Error("Refused: an unusual program path");
    return { file: env.ComSpec ?? "cmd.exe", args: ["/d", "/s", "/c", `"${[`"${program}"`, ...args].join(" ")}"`], verbatim: true };
  }
  return { file: program, args, verbatim: false };
}

/** The environment for a helper: no terminal prompt can hang the app, and its words are parseable. */
export function toolEnv(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base, GIT_TERMINAL_PROMPT: "0", GH_PROMPT_DISABLED: "1", GH_NO_UPDATE_NOTIFIER: "1", NO_COLOR: "1", LC_ALL: "C", LANGUAGE: "C" };
  // A sign-in may need the helper's own window; reading credentials elsewhere still turns it off.
  delete env.GCM_INTERACTIVE;
  return env;
}

/** A runner for real programs. `onSpawn` sees every program and argument list (tests and the spawn log check them). */
export function createToolRunner(options: { onSpawn?: (program: string, args: string[]) => void } = {}): ToolRunner {
  return (program, call) => {
    const env = toolEnv(call.env ?? process.env);
    let killed = false;
    let child: ReturnType<typeof spawn> | undefined;
    const done = new Promise<ToolResult>((resolve) => {
      let cmd: ReturnType<typeof commandFor>;
      try {
        cmd = commandFor(program, call.args, env);
      } catch (e) {
        return resolve({ code: -1, stdout: "", stderr: String(e), killed: false });
      }
      options.onSpawn?.(program, call.args);
      let stdout = "", stderr = "";
      try {
        child = spawn(cmd.file, cmd.args, { cwd: call.cwd, env, windowsHide: true, windowsVerbatimArguments: cmd.verbatim, stdio: ["pipe", "pipe", "pipe"] });
      } catch (e) {
        // A program that isn't one (a damaged helper: EFTYPE) throws here rather than failing.
        return resolve({ code: -1, stdout: "", stderr: String(e), killed: false });
      }
      const timer = call.timeoutMs ? setTimeout(() => { killed = true; child?.kill(); }, call.timeoutMs) : undefined;
      child.stdout?.setEncoding("utf8").on("data", (d: string) => { stdout += d; call.onOutput?.(d); });
      child.stderr?.setEncoding("utf8").on("data", (d: string) => { stderr += d; call.onOutput?.(d); });
      child.stdin?.on("error", () => {});
      child.stdin?.end(call.input ?? "");
      child.on("error", (e) => { clearTimeout(timer); resolve({ code: -1, stdout, stderr: `${stderr}\n${e.message}`, killed }); });
      child.on("close", (code) => { clearTimeout(timer); resolve({ code: killed || code === null ? -1 : code, stdout, stderr, killed }); });
    });
    return { done, kill: () => { killed = true; child?.kill(); } };
  };
}

/** Whether a configured credential helper is Git Credential Manager ("manager", "manager-core", or its path). */
export const isGcmHelper = (helper: string) => /^manager(-core)?$/i.test(helper.trim()) || /git-credential-manager/i.test(helper);
/** Whether a configured credential helper is the GitHub CLI's (`gh auth git-credential`). */
export const isGhHelper = (helper: string) => /\bgh(\.exe|\.cmd)?["']?\s+auth\s+git-credential/i.test(helper);

/** Where Git keeps its own programs, and where Git for Windows puts Git Credential Manager. */
export function gitProgramDirs(execPath: string): string[] {
  const p = execPath.trim();
  if (!p) return [];
  return [p, join(p, "..", "..", "bin")].filter((d) => existsSync(d));
}
