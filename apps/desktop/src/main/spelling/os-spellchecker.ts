/**
 * Windows' own spell checker (the Spell Checking API, `ISpellChecker`, the one that underlines words
 * in the note) asked directly, for the right-click menu (D-193). Electron 41 and later on Windows
 * underline misspelled words but never report one to the `context-menu` event (`misspelledWord` is
 * always empty; electron/electron#54729), and `webFrame`'s checks have no dictionary there
 * (electron/electron#28684), so the shell asks the OS itself, with the session's languages and the
 * user's dictionary ("Add to dictionary" writes to it through the session).
 *
 * One small helper process: Windows PowerShell, by its absolute path, reading its script from its
 * input (never a file, so no execution policy applies), then one request a line. Words travel as
 * base64 of UTF-8, so no console code page can change them. It starts in the background and answers
 * in a few milliseconds; until it's ready, a right-click shows the edit actions alone (no wait).
 * If it can't start or it stops, the menu keeps working without suggestions, and it isn't restarted.
 */
import type { ChildProcessWithoutNullStreams } from "node:child_process";

export interface SpellCheck {
  misspelled: boolean;
  /** The OS's suggestions, best first; empty when the word is spelled right. */
  suggestions: string[];
}

/** The longest word worth asking about: anything longer isn't a word. */
export const MAX_WORD = 64;
const MAX_CACHE = 500;
/** How long one answer may take before the menu shows without it. */
export const ANSWER_MS = 300;

/** The C# that talks to the OS: misspelled in every language asked, with the first such language's suggestions. */
const CS = String.raw`
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
[ComImport, Guid("8E018A9D-2415-4677-BF08-794EA61F94BB"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IFnSpellFactory {
  IEnumString SupportedLanguages();
  int IsSupported([MarshalAs(UnmanagedType.LPWStr)] string tag);
  IFnSpellChecker CreateSpellChecker([MarshalAs(UnmanagedType.LPWStr)] string tag);
}
[ComImport, Guid("B6FD0B71-E2BC-4653-8D05-F197E412770B"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IFnSpellChecker {
  [return: MarshalAs(UnmanagedType.LPWStr)] string LanguageTag();
  IFnSpellingErrors Check([MarshalAs(UnmanagedType.LPWStr)] string text);
  [PreserveSig] int Suggest([MarshalAs(UnmanagedType.LPWStr)] string word, out IEnumString value);
}
[ComImport, Guid("803E3BD4-2828-4410-8290-418D1D73C762"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IFnSpellingErrors { [PreserveSig] int Next(out IFnSpellingError value); }
[ComImport, Guid("B7C82D61-FBE8-4B47-9B27-6C0D2E0DE0A3"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IFnSpellingError { uint StartIndex(); uint Length(); int CorrectiveAction(); [return: MarshalAs(UnmanagedType.LPWStr)] string Replacement(); }
public static class FnSpell {
  static readonly Dictionary<string, IFnSpellChecker> checkers = new Dictionary<string, IFnSpellChecker>();
  static readonly IFnSpellFactory factory = (IFnSpellFactory)Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("7AB36653-1796-484B-BDFA-E74F1DB7C1DC")));
  static IFnSpellChecker For(string tag) {
    IFnSpellChecker c;
    if (checkers.TryGetValue(tag, out c)) return c;
    c = factory.IsSupported(tag) != 0 ? factory.CreateSpellChecker(tag) : null;
    checkers[tag] = c;
    return c;
  }
  static string B64(string s) { return Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes(s)); }
  public static string Answer(string line) {
    var parts = line.Split('\t');
    if (parts.Length != 3) return "";
    var id = parts[0];
    try {
      var word = System.Text.Encoding.UTF8.GetString(Convert.FromBase64String(parts[2]));
      List<string> first = null;
      var known = false;
      foreach (var tag in parts[1].Split(',')) {
        var c = For(tag);
        if (c == null) continue;
        known = true;
        IFnSpellingError err;
        if (c.Check(word).Next(out err) != 0) return id + "\t0";
        if (first != null) continue;
        first = new List<string>();
        if (err.CorrectiveAction() == 2) { first.Add(err.Replacement()); continue; }
        IEnumString e;
        if (c.Suggest(word, out e) != 0 || e == null) continue;
        var one = new string[1];
        while (first.Count < 10 && e.Next(1, one, IntPtr.Zero) == 0) first.Add(one[0]);
      }
      if (!known) return id + "\t-";
      var answer = new List<string> { id, "1" };
      foreach (var s in first) answer.Add(B64(s));
      return string.Join("\t", answer);
    } catch { return id + "\t-"; }
  }
}
`;

/** The helper's script: compile the C#, say it's ready, then answer one line at a time until its input ends. */
export const HELPER_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  `Add-Type -TypeDefinition @'\n${CS}\n'@`,
  "[Console]::Out.WriteLine('ready'); [Console]::Out.Flush()",
  "while ($null -ne ($l = [Console]::In.ReadLine())) { [Console]::Out.WriteLine([FnSpell]::Answer($l)); [Console]::Out.Flush() }",
].join("\n");

/** The arguments: the script comes as the first input line, so it's never in a file or on the command line. */
export const HELPER_ARGS = ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", "$b=[Console]::In.ReadLine();iex ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b)))"];

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
const unb64 = (s: string) => Buffer.from(s, "base64").toString("utf8");

/** One request line: an ID, the languages, the word. */
export function encodeRequest(id: number, languages: readonly string[], word: string): string {
  return `${id}\t${languages.join(",")}\t${b64(word)}\n`;
}

/** One answer line, or undefined for a malformed one. `check` is undefined when no language could check the word. */
export function parseAnswer(line: string): { id: number; check: SpellCheck | undefined } | undefined {
  const [id, state, ...rest] = line.trim().split("\t");
  const n = Number(id);
  if (!id || !Number.isInteger(n) || !state) return undefined;
  if (state === "0") return { id: n, check: { misspelled: false, suggestions: [] } };
  if (state === "1") return { id: n, check: { misspelled: true, suggestions: rest.map(unb64).filter((s) => s.length > 0 && s.length <= MAX_WORD * 2) } };
  return { id: n, check: undefined };
}

/** Whether a word is worth asking about: letters (with their marks and apostrophes) only, and not too long. */
export const askable = (word: string): boolean => word.length <= MAX_WORD && /^[\p{L}\p{M}'’]+$/u.test(word) && /\p{L}/u.test(word);

/** Language tags as the OS takes them: `en-US`, `fr`. */
const TAG = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

export class OsSpellChecker {
  #proc: ChildProcessWithoutNullStreams | undefined;
  #state: "idle" | "starting" | "ready" | "gone" = "idle";
  #next = 1;
  #buffer = "";
  readonly #waiting = new Map<number, (c: SpellCheck | undefined) => void>();
  /** Each request's cache key, so an answer that comes too late for its menu is ready for the next one. */
  readonly #keys = new Map<number, string>();
  readonly #cache = new Map<string, SpellCheck>();
  readonly #start: () => ChildProcessWithoutNullStreams;
  #prime: string[] = [];

  constructor(start: () => ChildProcessWithoutNullStreams) {
    this.#start = start;
  }

  get ready(): boolean {
    return this.#state === "ready";
  }

  /**
   * Starts the helper in the background, once. With languages, it also loads their dictionaries as
   * soon as it's ready: the OS takes longer than a menu can wait to load one the first time.
   */
  warm(languages: readonly string[] = []): void {
    if (!this.#prime.length) this.#prime = languages.filter((l) => TAG.test(l));
    if (this.#state !== "idle") return;
    this.#state = "starting";
    let p: ChildProcessWithoutNullStreams;
    try {
      p = this.#start();
    } catch {
      this.#state = "gone";
      return;
    }
    this.#proc = p;
    p.stdout.setEncoding("utf8");
    p.stdout.on("data", (d: string) => this.#read(d));
    p.stderr.resume();
    p.stdin.on("error", () => this.#gone());
    p.on("error", () => this.#gone());
    p.on("exit", () => this.#gone());
    p.stdin.write(`${b64(HELPER_SCRIPT)}\n`);
  }

  /** The OS's answer for a word, or undefined (not ready, not a word, or no answer in time). Never waits for the helper to start. */
  async check(word: string, languages: readonly string[]): Promise<SpellCheck | undefined> {
    const tags = languages.filter((l) => TAG.test(l));
    if (!askable(word) || !tags.length) return undefined;
    const key = `${tags.join(",")}\t${word}`;
    const cached = this.#cache.get(key);
    if (cached) return cached;
    const proc = this.#proc;
    if (this.#state !== "ready" || !proc) return undefined;
    const id = this.#next++;
    this.#keys.set(id, key);
    const answer = await new Promise<SpellCheck | undefined>((resolve) => {
      const timer = setTimeout(() => {
        this.#waiting.delete(id);
        resolve(undefined);
      }, ANSWER_MS);
      this.#waiting.set(id, (c) => {
        clearTimeout(timer);
        resolve(c);
      });
      proc.stdin.write(encodeRequest(id, tags, word));
    });
    if (answer) this.#remember(key, answer);
    return answer;
  }

  #remember(key: string, answer: SpellCheck): void {
    this.#cache.delete(key);
    if (this.#cache.size >= MAX_CACHE) this.#cache.delete(this.#cache.keys().next().value!);
    this.#cache.set(key, answer);
  }

  /** A word added to the dictionary: asked again next time. */
  forget(word: string): void {
    for (const k of [...this.#cache.keys()]) if (k.endsWith(`\t${word}`)) this.#cache.delete(k);
  }

  dispose(): void {
    const p = this.#proc;
    this.#gone();
    try {
      p?.stdin.end();
      p?.kill();
    } catch {
      // Already gone.
    }
  }

  #read(d: string): void {
    this.#buffer += d;
    for (let i = this.#buffer.indexOf("\n"); i >= 0; i = this.#buffer.indexOf("\n")) {
      const line = this.#buffer.slice(0, i).trim();
      this.#buffer = this.#buffer.slice(i + 1);
      if (line === "ready") {
        if (this.#state === "starting") {
          this.#state = "ready";
          // A word that isn't a request's: its answer only loads the dictionaries.
          if (this.#prime.length) this.#proc?.stdin.write(encodeRequest(0, this.#prime, "a"));
        }
        continue;
      }
      const a = parseAnswer(line);
      if (!a) continue;
      const key = this.#keys.get(a.id);
      this.#keys.delete(a.id);
      const waiting = this.#waiting.get(a.id);
      this.#waiting.delete(a.id);
      if (waiting) waiting(a.check);
      else if (key && a.check) this.#remember(key, a.check);
    }
  }

  #gone(): void {
    this.#state = "gone";
    this.#proc = undefined;
    for (const done of this.#waiting.values()) done(undefined);
    this.#waiting.clear();
    this.#keys.clear();
  }
}
