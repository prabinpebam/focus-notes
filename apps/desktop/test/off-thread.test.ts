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
    const exited = new Promise<void>((r) => p.on("exit", () => r()));
    p.stdin.write("ready\n");
    await expect.poll(() => out, { timeout: 10_000 }).toBe("echo ready\n");
    p.kill();
    await exited;
  });

  it("reports a program that can't start as an error, never a throw", async () => {
    const p = spawnOffThread("Z:\\no\\such\\program.exe", []);
    await new Promise<void>((r) => p.on("error", () => r()));
    expect(() => p.stdin.write("ignored\n")).not.toThrow();
  });

  it("drains the helper's final output and preserves its exit status", async () => {
    const p = spawnOffThread(process.execPath, ["-e", "process.stdout.write('sealed output');process.exitCode=7"]);
    let output = "";
    p.stdout.on("data", data => { output += data; });
    const code = await new Promise<number | null | undefined>(resolve => p.on("exit", resolve));
    expect(code).toBe(7);
    expect(output).toBe("sealed output");
  });

  it("kills and reaps a live helper before reporting a failed stdin write", async () => {
    const p = spawnOffThread(process.execPath, ["-e", "process.stdout.write(String(process.pid)+'\\n');setInterval(()=>{},1000)"]);
    let output = "";
    p.stdout.on("data", data => { output += data; });
    let failed = false;
    let ended = false;
    const settled = new Promise<void>(resolve => {
      p.on("error", () => { failed = true; ended = true; resolve(); });
      p.on("exit", () => { ended = true; resolve(); });
    });
    try {
      await expect.poll(() => output.trim(), { timeout: 10_000 }).toMatch(/^\d+$/);
      const pid = Number(output.trim());
      // Invalid runtime input makes the real child's stdin.write throw inside the worker.
      Reflect.apply(p.stdin.write, p.stdin, [null]);
      await expect.poll(() => failed, { timeout: 5000 }).toBe(true);
      expect(() => process.kill(pid, 0)).toThrow();
    } finally {
      if (!ended) p.kill();
      await settled;
    }
  });
});
