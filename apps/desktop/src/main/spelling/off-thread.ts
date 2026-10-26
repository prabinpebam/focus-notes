/**
 * Starts a helper process from a worker thread (DEF-39). On Windows, starting a process holds the
 * thread that asks for it until the program is loaded, and for PowerShell that can be most of a
 * second: on the main process's thread, keys wait meanwhile, and a crash then loses them. The worker
 * starts it and passes its input and output on, so the main thread never waits.
 */
import { EventEmitter } from "node:events";
import { Worker } from "node:worker_threads";
import type { HelperProcess } from "./os-spellchecker.ts";

/** The worker: starts the program, sends its output up and writes what comes down to its input. */
const WORKER = `
const { parentPort, workerData } = require("node:worker_threads");
const { spawn } = require("node:child_process");
let p;
try {
  p = spawn(workerData.exe, workerData.args, { windowsHide: true, stdio: "pipe" });
} catch {
  parentPort.postMessage({ t: "error" });
}
if (p) {
  p.stdout.setEncoding("utf8");
  p.stdout.on("data", (d) => parentPort.postMessage({ t: "out", d }));
  p.stderr.resume();
  p.stdin.on("error", () => parentPort.postMessage({ t: "error" }));
  p.on("error", () => parentPort.postMessage({ t: "error" }));
  p.on("exit", () => parentPort.postMessage({ t: "exit" }));
  parentPort.on("message", (m) => {
    try {
      if (m.t === "in") p.stdin.write(m.d);
      else if (m.t === "end") p.stdin.end();
      else if (m.t === "kill") p.kill();
    } catch {
      parentPort.postMessage({ t: "error" });
    }
  });
}
`;

export function spawnOffThread(exe: string, args: readonly string[]): HelperProcess {
  const worker = new Worker(WORKER, { eval: true, workerData: { exe, args: [...args] } });
  const out = new EventEmitter();
  const input = new EventEmitter();
  const proc = new EventEmitter();
  let ended = false;
  const end = (kind: "error" | "exit") => {
    if (ended) return;
    ended = true;
    // An error no one listens for is no throw: the checker only stops using its helper.
    if (kind === "error" && input.listenerCount("error")) input.emit("error");
    if (kind === "exit" || proc.listenerCount("error")) proc.emit(kind);
    void worker.terminate();
  };
  worker.on("message", (m: { t: string; d?: string }) => {
    if (m.t === "out" && typeof m.d === "string") out.emit("data", m.d);
    else if (m.t === "error" || m.t === "exit") end(m.t);
  });
  worker.on("error", () => end("error"));
  worker.on("exit", () => end("exit"));
  const send = (m: { t: string; d?: string }) => {
    if (!ended) worker.postMessage(m);
  };
  return {
    stdout: { setEncoding: () => undefined, on: (_e: "data", f: (d: string) => void) => out.on("data", f) },
    stderr: { resume: () => undefined },
    stdin: {
      write: (d: string) => send({ t: "in", d }),
      end: () => send({ t: "end" }),
      on: (_e: "error", f: () => void) => input.on("error", f),
    },
    on: (e: "error" | "exit", f: () => void) => proc.on(e, f),
    kill: () => send({ t: "kill" }),
  };
}
