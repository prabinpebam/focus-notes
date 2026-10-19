import { spawn } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { askable, encodeRequest, HELPER_ARGS, OsSpellChecker, parseAnswer } from "../src/main/spelling/os-spellchecker.ts";
import { wordAround } from "../src/main/spelling/word.ts";

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

describe("the OS spell checker's protocol (D-193)", () => {
  it("sends a word as base64 of UTF-8, with its languages", () => {
    expect(encodeRequest(7, ["en-US", "fr-FR"], "café")).toBe(`7\ten-US,fr-FR\t${b64("café")}\n`);
  });

  it("reads right, misspelled with suggestions, and unknown answers", () => {
    expect(parseAnswer("3\t0")).toEqual({ id: 3, check: { misspelled: false, suggestions: [] } });
    expect(parseAnswer(`4\t1\t${b64("mistake")}\t${b64("mis take")}\r`)).toEqual({ id: 4, check: { misspelled: true, suggestions: ["mistake", "mis take"] } });
    expect(parseAnswer("5\t1")).toEqual({ id: 5, check: { misspelled: true, suggestions: [] } });
    expect(parseAnswer("6\t-")).toEqual({ id: 6, check: undefined });
  });

  it("ignores lines that aren't answers", () => {
    for (const line of ["", "ready", "x\t0", "1.5\t0", "WARNING: something"]) expect(parseAnswer(line)).toBeUndefined();
  });

  it("asks only about words", () => {
    for (const w of ["mistaek", "don't", "naïve", "Ångström", "बिल्ली"]) expect(askable(w)).toBe(true);
    for (const w of ["", "a1", "foo-bar", "'", "x".repeat(65), "hello world"]) expect(askable(w)).toBe(false);
  });

  it("doesn't wait for a helper that isn't ready, and survives one that can't start", async () => {
    const c = new OsSpellChecker(() => {
      throw new Error("no PowerShell");
    });
    expect(await c.check("mistaek", ["en-US"])).toBeUndefined();
    c.warm();
    expect(c.ready).toBe(false);
    expect(await c.check("mistaek", ["en-US"])).toBeUndefined();
  });
});

describe("the word under the pointer (D-193)", () => {
  it("finds the word around an offset", () => {
    const text = "Thsi sentence has a mistaek in it.";
    expect(wordAround(text, text.indexOf("mistaek") + 3)).toEqual({ start: 20, end: 27, word: "mistaek" });
    expect(wordAround(text, 0)?.word).toBe("Thsi");
    expect(wordAround(text, text.indexOf(" in"))?.word).toBe("mistaek");
    expect(wordAround(text, text.length)).toBeUndefined();
  });

  it("keeps inner apostrophes and drops quotes", () => {
    expect(wordAround("I don’t know", 4)?.word).toBe("don’t");
    expect(wordAround("say 'helo' now", 6)?.word).toBe("helo");
  });

  it("finds nothing between words", () => {
    expect(wordAround("a  -  b", 3)).toBeUndefined();
    expect(wordAround("", 0)).toBeUndefined();
  });
});

describe.runIf(process.platform === "win32")("Windows' spell checker, asked for real (D-193)", () => {
  const exe = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");

  it("names a misspelled word's suggestions and passes a right one", async () => {
    const c = new OsSpellChecker(() => spawn(exe, HELPER_ARGS, { windowsHide: true, stdio: "pipe" }));
    try {
      c.warm();
      const until = Date.now() + 20_000;
      while (!c.ready && Date.now() < until) await new Promise((r) => setTimeout(r, 50));
      expect(c.ready).toBe(true);
      const wrong = await c.check("mistaek", ["en-US"]);
      expect(wrong?.misspelled).toBe(true);
      expect(wrong?.suggestions).toContain("mistake");
      expect(await c.check("sentence", ["en-US"])).toEqual({ misspelled: false, suggestions: [] });
      expect(await c.check("mistaek", ["zz-ZZ"])).toBeUndefined();
    } finally {
      c.dispose();
    }
  }, 30_000);
});
