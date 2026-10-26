/**
 * DEF-39 (D-193): the spell checker's helper is started from a worker thread, so starting PowerShell
 * never holds the main process's thread; its input and output pass through unchanged.
 */
import { describe, expect, it } from "vitest";
import { spawnOffThread } from "../src/main/spelling/off-thread.ts";

describe("spawnOffThread", () => {
  it("passes input to the helper and its output back, and ends when it's killed", async () => {
    const p = spawnOffThread(process.execPath, ["-e", "process.stdin.setEncoding('utf8');process.stdin.on('data',(d)=>process.stdout.write('echo '+d))"]);
    let out = "";
    p.stdout.setEncoding("utf8");
    p.stdout.on("data", (d) => (out += d));
    const exited = new Promise<void>((r) => p.on("exit", r));
    p.stdin.write("ready\n");
    await expect.poll(() => out, { timeout: 10_000 }).toBe("echo ready\n");
    p.kill();
    await exited;
  });

  it("reports a program that can't start as an error, never a throw", async () => {
    const p = spawnOffThread("Z:\\no\\such\\program.exe", []);
    await new Promise<void>((r) => p.on("error", r));
    expect(() => p.stdin.write("ignored\n")).not.toThrow();
  });
});
