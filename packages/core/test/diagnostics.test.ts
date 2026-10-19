/**
 * QLT-04 (D-55, D-140): the diagnostic report says how the app and this computer are doing, and
 * never anything of the person's: no note text, note or folder names, paths, email addresses,
 * passwords, keys, or tokens, even when a problem line or a version string carries one.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildReport, MEASURE_NAMES, parseTimings, previewOf, ProblemLog, redact, settingsSummary, summarizeTimings, type DiagnosticFacts } from "../src/diagnostics.ts";
import { OPEN_MEASURE } from "../src/app.ts";
import { SPOTLIGHT_MEASURE } from "../src/spotlight-app.ts";

const TOKEN = "ghp_" + "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8";
const PAT = "github_pat_" + "11ABCDEFG0123456789_abcdefghijklmnopqrstuvwxyz";
const NOTE_TEXT = "Dear diary, the garden plan is secret";
const HOME = "C:\\Users\\Ada Lovelace";
const WORKSPACE = `${HOME}\\Documents\\Focus Notes`;

const facts = (patch: Partial<DiagnosticFacts> = {}): DiagnosticFacts => ({
  generatedAt: Date.UTC(2026, 9, 15, 12, 0, 0),
  app: { version: "0.5.0", packaged: true },
  os: { platform: "win32", release: "10.0.26100", arch: "x64" },
  runtime: { electron: "38.1.0", chrome: "140.0.0.0", node: "22.19.0" },
  git: { installed: true, version: "2.47.1", ok: true, gcm: true, gh: false },
  workspace: {
    git: true, state: "problem", problem: "offline", waiting: 2, conflicts: 1,
    repositories: [
      { role: "notes", remote: "github", branch: true, upstream: true, ahead: 1, behind: 0, changed: 1, unmerged: 0 },
      { role: "private", remote: "github", branch: true, upstream: true, ahead: 0, behind: 3, changed: 0, unmerged: 1 },
    ],
  },
  journal: { notes: 1, bytes: 342 },
  compositing: "software",
  settings: { appearance: "dark", darkTheme: "ink", uiScale: 1.1, focusMode: true },
  timings: [{ name: "fn:note.open", count: 4, p50: 12, p95: 40 }],
  problems: [{ at: Date.UTC(2026, 9, 15, 11, 59, 0), line: "sync: problem=offline" }],
  ...patch,
});

describe("QLT-04: redact", () => {
  it("takes out GitHub tokens, bearer tokens, and credentials in addresses", () => {
    expect(redact(`push https://x-access-token:${TOKEN}@github.com/ada/notes.git failed`)).not.toContain(TOKEN);
    expect(redact(`push https://ada:hunter2pass@github.com/ada/notes.git`)).toBe("push https://[redacted]@github.com/…");
    expect(redact("fetch git@github.com:ada/private-notes.git")).toBe("fetch github.com:…");
    expect(redact("open https://ada.github.io/notes/trips/rome")).toBe("open https://ada.github.io/…");
    expect(redact(`token ${TOKEN}`)).not.toContain(TOKEN.slice(4));
    expect(redact(`Authorization: Bearer abcdefgh12345678`)).not.toContain("abcdefgh12345678");
    expect(redact(`saw ${PAT} in output`)).toBe("saw [token] in output");
  });
  it("takes out password-, passcode-, secret- and key-style pairs, private keys, and long encoded strings", () => {
    for (const k of ["password", "passcode", "passphrase", "secret", "api_key", "key"]) expect(redact(`${k}=correct-horse`)).toBe(`${k}=[redacted]`);
    expect(redact('passphrase: "two words"')).toBe("passphrase: [redacted]");
    expect(redact("-----BEGIN OPENSSH PRIVATE KEY-----\nAAAA\n-----END OPENSSH PRIVATE KEY-----")).toBe("[private key]");
    expect(redact(`vault ${"Zm9vYmFyYmF6cXV4".repeat(3)}== stored`)).toBe("vault [redacted] stored");
  });
  it("takes out email addresses, device codes, and known strings in any case, as whole words, longest first", () => {
    expect(redact("author ada@example.com")).toBe("author [email]");
    expect(redact("enter WDJB-MJHT at github.com/login/device")).toBe("enter [code] at github.com/login/device");
    expect(redact("hello AdaLovelace and ada, not adam", { known: ["adalovelace", "ada", "x"] })).toBe("hello [redacted] and [redacted], not adam");
    expect(redact("pushed ada-secret-journal", { known: ["ada-secret-journal", "Ada Lovelace"] })).toBe("pushed [redacted]");
  });
  it("takes out quoted secret values, and a secret after a space", () => {
    for (const [line, secret] of [['{"passcode":"482913"}', "482913"], ['"password": "hunter2"', "hunter2"], ["passcode 482913", "482913"], ["token: 'abc def'", "abc def"]] as const) {
      const r = redact(line);
      expect(r, line).not.toContain(secret);
      expect(r, line).toContain("[redacted]");
    }
  });
  it("replaces the workspace's and the home folder's paths with everything after them, in either slash style", () => {
    const o = { home: HOME, workspace: WORKSPACE };
    expect(redact(`opened ${WORKSPACE}\\private\\notes\\Acme merger\\plan v2.md for review`, o)).toBe("opened <workspace>");
    expect(redact(`("${WORKSPACE}\\Secret Project") failed`, o)).toBe('("<workspace>") failed');
    expect(redact("at c:/users/ada lovelace/AppData/Roaming/Focus Notes", o)).toBe("at ~");
    expect(redact("saved ~/Documents/Secret Project/plan.md")).toBe("saved ~");
    // Only a whole folder: a sibling whose name starts the same is another path.
    expect(redact("C:\\Users\\Ada Lovelace2\\x", { home: HOME })).toBe("<path>");
  });
  it("replaces every other absolute path to a quote or the end of the line, spaces and all, and runs of words ending in a note's name", () => {
    const cases = [
      ["C:\\Users\\Jane Doe\\OneDrive - Contoso\\Notes\\Clients\\Acme merger\\plan v2.md", ["Jane", "Doe", "Contoso", "Acme", "merger", "plan"]],
      ["D:\\Dropbox (Personal)\\Notes\\Diary 2026.md", ["Dropbox", "Personal", "Diary"]],
      ["C:\\Users\\Пётр Иванов\\notes", ["Пётр", "Иванов"]],
      ["\\\\fileserver\\home$\\jane doe\\notes", ["fileserver", "jane", "doe"]],
      ["//fileserver/home$/jane doe/notes", ["fileserver", "jane", "doe"]],
      ["/c/Users/Jane Doe/Documents/Focus Notes/x.md", ["Jane", "Doe", "Documents"]],
      ["~/Documents/Secret Project/plan.md", ["Documents", "Secret", "Project", "plan"]],
      ['commit "Update notes/Divorce lawyer call.md"', ["Divorce", "lawyer", "call"]],
      ["could not write Divorce lawyer call.md", ["Divorce", "lawyer", "call"]],
      ["//server/share/x", ["server", "share"]],
      ["read /opt/x/y failed", ["opt", "x/y"]],
      ["read /home/ada/notes failed", ["ada", "home"]],
    ] as const;
    for (const [line, words] of cases) {
      const r = redact(`sync: ${line}`);
      for (const w of words) expect(r, `${line} → ${r}`).not.toContain(w);
      expect(r).toMatch(/^sync: /);
    }
    expect(redact('commit "Update notes/Divorce lawyer call.md" failed')).toBe('commit "<note>" failed');
  });
  it("leaves the app's own facts and addresses as they are", () => {
    for (const line of ["- Focus Notes 0.5.0", "- Electron 38.1.0, Chromium 140.0.0.0, Node 22.19.0", "sync: problem=offline", "| fn:note.open | 4 | 12 | 40 |", "- notes repository: remote github, branch with upstream, ahead 1, behind 0, 1 changed, 0 unmerged", "- Made 2026-10-15T12:00:00Z", "open https://github.com/…"]) {
      expect(redact(line)).toBe(line);
    }
  });
  it("runs in linear time on long and adversarial input: 20,000 characters in under 50 ms each", () => {
    const inputs = [
      "a@".repeat(10_000), "a.".repeat(10_000), "x".repeat(20_000), "/a".repeat(10_000), "\\\\".repeat(10_000), "C:\\".repeat(6_667),
      "https://".repeat(2_500), "password ".repeat(2_223), '"'.repeat(20_000), "a b.".repeat(5_000) + "md", "-----BEGIN PRIVATE KEY-----".repeat(741), "AB12-".repeat(4_000),
      `a${"@a.".repeat(6_666)}`, "~/".repeat(10_000), "<workspace>".repeat(1_818),
    ];
    for (const s of inputs) {
      const t0 = performance.now();
      redact(s, { known: ["adalovelace", "notes"], home: HOME, workspace: WORKSPACE });
      expect(performance.now() - t0, s.slice(0, 20)).toBeLessThan(50);
    }
    const log = new ProblemLog();
    const t0 = performance.now();
    log.add("a@".repeat(10_000));
    expect(performance.now() - t0).toBeLessThan(50);
    expect(log.list()[0]!.line.length).toBeLessThanOrEqual(200);
  });
});

describe("QLT-04: the report", () => {
  it("has the versions, Git and its helper, the workspace's health, the journal, compositing, settings, timings, and recent problems", () => {
    const r = buildReport(facts());
    expect(r).toContain("## Focus Notes diagnostic report");
    expect(r).toContain("- Focus Notes 0.5.0");
    expect(r).toContain("- OS: win32 10.0.26100 (x64)");
    expect(r).toContain("- Electron 38.1.0, Chromium 140.0.0.0, Node 22.19.0");
    expect(r).toContain("- Compositing: software");
    expect(r).toContain("- Git 2.47.1 (new enough)");
    expect(r).toContain("- Git Credential Manager is the credential helper: yes");
    expect(r).toContain("- Saving with Git: problem (offline), 2 change(s) not on GitHub, 1 conflict(s) held");
    expect(r).toContain("- private repository: remote github, branch with upstream, ahead 0, behind 3, 0 changed, 1 unmerged");
    expect(r).toContain("- Unsaved text for 1 note(s), 342 bytes");
    expect(r).toContain("- darkTheme: ink");
    expect(r).toContain("| fn:note.open | 4 | 12 | 40 |");
    expect(r).toContain("- 2026-10-15T11:59:00Z sync: problem=offline");
    expect(r).toContain("Nothing was sent.");
  });
  it("never has a token, a secret, note text, a path, or an email, wherever they came from", () => {
    const leaky = facts({
      app: { version: `0.5.0 ${TOKEN}`, packaged: false },
      os: { platform: "win32", release: `10.0 ${WORKSPACE}\\diary.md`, arch: "x64" },
      problems: [
        { at: 1, line: `push https://ada:${TOKEN}@github.com/ada/notes.git` },
        { at: 2, line: `passcode=${NOTE_TEXT}` },
        { at: 3, line: `wrote ${WORKSPACE}\\private\\notes\\garden.md for ada@example.com` },
        { at: 4, line: `env GH_TOKEN=${PAT}` },
      ],
      settings: settingsSummary({ appearance: "dark", lightTheme: "My secret theme", lastNotePath: `${WORKSPACE}\\diary.md`, fontSize: 18 }),
      timings: summarizeTimings([{ name: "fn:note.open", duration: 3 }, { name: `C:\\Users\\Ada\\diary.md`, duration: 4 }, { name: NOTE_TEXT, duration: 5 }]),
    });
    const r = buildReport(leaky, { home: HOME, workspace: WORKSPACE, known: ["adalovelace"] });
    for (const bad of [TOKEN, TOKEN.slice(4, 20), PAT, "hunter", "garden", "diary", "Dear diary", "secret theme", "ada@example.com", "Ada Lovelace", "Users", "Focus Notes\\", "lastNotePath"]) {
      expect(r, bad).not.toContain(bad);
    }
    expect(r).toContain("- lightTheme: custom");
    expect(r).toContain("| fn:note.open | 1 | 3 | 3 |");
  });
  it("redacts the known strings in what the facts say, and keeps the report's own words", () => {
    const r = buildReport(facts({ problems: [{ at: 1, line: "push to ada-secret-journal failed for Ada Lovelace (adalovelace)" }] }), { known: ["notes", "private", "ada-secret-journal", "Ada Lovelace", "adalovelace"] });
    for (const own of ["## Focus Notes diagnostic report", "- notes repository:", "- private repository:"]) expect(r).toContain(own);
    for (const bad of ["ada-secret-journal", "Lovelace", "adalovelace"]) expect(r, bad).not.toContain(bad);
  });
  it("says so plainly when there's nothing to report", () => {
    const r = buildReport(facts({ problems: [], timings: [], settings: {}, journal: { notes: 0, bytes: 0 }, workspace: { git: false, state: "idle", waiting: 0, conflicts: 0, repositories: [] } }));
    expect(r).toContain("- Saving with Git: no (the workspace isn't a Git repository)");
    expect(r).toContain("- Empty: everything is saved");
    expect(r).toContain("- None since the app started");
    expect(r).toContain("- None yet");
  });
});

describe("QLT-04: timings, settings, the preview, and the log", () => {
  it("allow-lists every measure the app makes: the task tracker's targets are fixed IDs, never a note's name", () => {
    expect(MEASURE_NAMES).toContain(OPEN_MEASURE);
    expect(MEASURE_NAMES).toContain(SPOTLIGHT_MEASURE);
    const src = join(import.meta.dirname, "..", "src");
    const targets: string[] = [];
    for (const f of readdirSync(src).filter((f) => f.endsWith(".ts"))) {
      const text = readFileSync(join(src, f), "utf8");
      for (const m of text.matchAll(/tracker\.run\(\s*([^,]+),/g)) {
        let arg = m[1]!.trim();
        // A table of fixed targets (the first run's waits, PRF-13): every value a string literal, each checked below.
        const table = /^(FIRST_RUN_WAITS)\[\w+\]$/.exec(arg)?.[1];
        if (table) {
          const body = new RegExp(`export const ${table} = \\{([^}]*)\\}`).exec(text)?.[1] ?? "";
          const values = [...body.matchAll(/\w+:\s*([^,]+)/g)].map((x) => x[1]!.trim());
          expect(values.length, `${f}: ${table}`).toBeGreaterThan(0);
          for (const v of values) expect(v, `${f}: ${table}`).toMatch(/^"[\w.]+"$/);
          arg = values.join(" ");
          targets.push(...[...arg.matchAll(/"([\w.]+)"/g)].map((x) => x[1]!));
          continue;
        }
        // A string literal, or a choice between two (Remember on this browser).
        expect(arg, `${f}: ${arg}`).toMatch(/^("[\w.]+"|\w+ \? "[\w.]+" : "[\w.]+")$/);
        targets.push(...[...arg.matchAll(/"([\w.]+)"/g)].map((x) => x[1]!));
      }
    }
    expect(targets.length).toBeGreaterThan(4);
    for (const target of targets) expect(MEASURE_NAMES).toContain(`focus-notes:${target}`);
  });
  it("keeps only the allow-listed measure names, with counts and percentiles", () => {
    const t = summarizeTimings([...[10, 20, 30, 40, 100].map((d) => ({ name: "focus-notes:note.save", duration: d })), { name: "Garden plan", duration: 1 }, { name: "focus-notes:garden", duration: 1 }, { name: "fn:note.open", duration: Number.NaN }]);
    expect(t).toEqual([{ name: "focus-notes:note.save", count: 5, p50: 30, p95: 100 }]);
    expect(parseTimings([{ name: "fn:note.open", count: 2, p50: 1.4, p95: 9 }, { name: "note.open", count: 1, p50: 1, p95: 1 }, { name: "/home/ada", count: 1, p50: 1, p95: 1 }, { name: "fn:spotlight.open", count: -1, p50: 1, p95: 1 }, "x"])).toEqual([{ name: "fn:note.open", count: 2, p50: 1, p95: 9 }]);
    expect(buildReport(facts({ timings: [{ name: "Diary 2026", count: 1, p50: 1, p95: 1 }] }))).not.toContain("Diary");
  });
  it("summarizes each part for the preview", () => {
    expect(previewOf(facts())).toEqual({ version: "0.5.0", os: "Windows", electron: "38", git: "2.47.1", helper: "gcm", repositories: 2, ahead: 1, behind: 3, conflicts: 1, journal: 1, compositing: "software", problems: 1 });
  });
  it("keeps the latest lines, redacted as they arrive", () => {
    const log = new ProblemLog(3, () => ({ workspace: WORKSPACE }));
    for (let i = 0; i < 5; i++) log.add(`line ${i}`, i);
    log.add(`opened ${WORKSPACE}\\Secret Project with ${TOKEN}`, 9);
    expect(log.list()).toEqual([{ at: 3, line: "line 3" }, { at: 4, line: "line 4" }, { at: 9, line: "opened <workspace>" }]);
  });
});
