/**
 * The diagnostic report (QLT-04, D-55, D-140; Performance and quality → Diagnostics): facts about
 * this computer and this app that help someone fix a problem, and nothing of the person's. It's
 * built from structured facts, never from free text the app didn't make, so note text, note and
 * folder names, and file contents can't get in; then every line goes through `redact`, which takes
 * out tokens, passwords, keys, email addresses, credentials in addresses, and paths, in case a
 * problem line or a version string carries one. The main process builds it and copies or saves it:
 * nothing is ever sent (D-55).
 *
 * The report is in English whatever the app's language, because the people it's written for read
 * it in an issue on GitHub (D-140).
 */
import { BUILT_IN_THEMES } from "./themes.ts";

/** One of the workspace's repositories, without its name, folder, or address. */
export interface RepoHealth {
  role: "notes" | "private";
  /** Where its `origin` is: GitHub, somewhere else, or nowhere. Never the address. */
  remote: "github" | "other" | "none";
  /** On a branch (not detached), and the branch has an upstream. */
  branch: boolean;
  upstream: boolean;
  ahead: number;
  behind: number;
  /** Files changed and not committed (a count only). */
  changed: number;
  /** Files Git holds as unmerged. */
  unmerged: number;
}

export interface TimingSummary {
  name: string;
  count: number;
  p50: number;
  p95: number;
}

export interface Problem {
  /** Milliseconds since the epoch. */
  at: number;
  line: string;
}

/** Everything the report says, as data. */
export interface DiagnosticFacts {
  generatedAt: number;
  app: { version: string; packaged: boolean };
  os: { platform: string; release: string; arch: string };
  runtime: { electron: string; chrome: string; node: string };
  git: { installed: boolean; version?: string; ok: boolean; gcm: boolean; gh: boolean; bundled?: boolean };
  workspace: {
    git: boolean;
    state: "idle" | "syncing" | "problem";
    problem?: string;
    /** Changes not yet on GitHub. */
    waiting: number;
    /** Notes held in conflict, waiting for a choice (FIL-12). */
    conflicts: number;
    repositories: RepoHealth[];
  };
  /** The recovery journal: how many notes have unsaved text in it, and its size. Never the text or the notes' names. */
  journal: { notes: number; bytes: number };
  compositing: "gpu" | "software";
  /** Device settings that change how the app looks and works: values only, never names the person chose. */
  settings: Record<string, string | number | boolean>;
  timings: TimingSummary[];
  /** The app's own log lines since it started: counts and problem codes. */
  problems: Problem[];
}

/** What the report never includes: shown beside the preview and written at the top of the report. */
export const NEVER_INCLUDED = "No note text, note or folder names, paths, email addresses, passwords, keys, or tokens.";
/** At most this many of the latest problems and timings go in a report. */
export const REPORT_PROBLEMS = 50;
export const REPORT_TIMINGS = 40;
const LINE_MAX = 200;

export interface RedactOptions {
  /**
   * Strings that must never appear, whatever their case: the GitHub login, the repositories' names,
   * Git's user.name and user.email (D-140). Three characters or more; shorter ones are ignored.
   */
  known?: readonly string[];
  /** Folders whose paths are replaced: the home folder by `~`, the workspace by `<workspace>`. */
  home?: string;
  workspace?: string;
}

/** What the report is for: `forSend` when Send feedback posts it, so it doesn't say nothing was sent (D-203). */
export interface ReportUse { forSend?: boolean }

/** `redact` reads at most this much of its input, so no pattern can run long (D-140). */
export const REDACT_MAX = 4096;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** A folder in both slash styles, case-insensitively, as Windows spells it either way, and only as a whole folder. */
const folderPattern = (dir: string) => {
  const trimmed = dir.replace(/[\\/]+$/, "");
  if (trimmed.length < 3) return undefined;
  const parts = trimmed.split(/[\\/]+/).map(escape);
  return new RegExp(`${parts.join("[\\\\/]+")}(?=[\\\\/]|$|[\\s"'])`, "gi");
};

/** What a path runs to: a quote, or the end of the line. Paths may hold spaces and brackets. */
const TO_END = String.raw`[^"'\n]*`;
const SECRET_KEYS = "password|passwd|passcode|passphrase|secret|token|api[_-]?key|key|authorization";

/**
 * Takes out anything secret or personal from a line of text. In order: known strings; the
 * workspace's and the home folder's paths, with everything after them; credentials and paths in
 * addresses, and Git's SSH form; private keys; GitHub and bearer tokens; secret-style values, quoted
 * or not; email addresses; device codes; long runs of base64 or hex; any other absolute path to the
 * end of the line; and runs of words ending in a Markdown file name. Every pattern is bounded, and
 * the input is cut at `REDACT_MAX`.
 */
export function redact(text: string, o: RedactOptions = {}): string {
  let s = text.length > REDACT_MAX ? text.slice(0, REDACT_MAX) : text;
  for (const k of [...new Set(o.known ?? [])].map((k) => k.trim()).filter((k) => k.length >= 3 && k.length <= 200).sort((a, b) => b.length - a.length)) {
    s = s.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escape(k)}(?![\\p{L}\\p{N}])`, "giu"), "[redacted]");
  }
  const ws = o.workspace ? folderPattern(o.workspace) : undefined;
  if (ws) s = s.replace(ws, "<workspace>");
  const home = o.home ? folderPattern(o.home) : undefined;
  if (home) s = s.replace(home, "~");
  return s
    // Whatever follows the workspace or the home folder names the person's folders and notes.
    .replace(new RegExp(`<workspace>[^"')\\n]*`, "g"), "<workspace>")
    .replace(new RegExp(`(^|[\\s"'(=:])~[\\\\/][^"')\\n]*`, "g"), "$1~")
    // https://user:token@host → https://[redacted]@host; an address keeps its host only; so does git@host:owner/repo.
    .replace(/\b([a-z][a-z0-9+.-]{0,31}:\/\/)[^\s/@]{1,256}@/gi, "$1[redacted]@")
    .replace(/\b([a-z][a-z0-9+.-]{0,31}:\/\/(?:\[redacted\]@)?[^\s/]{1,256})\/\S*/gi, "$1/…")
    .replace(/(?<![\w.-])[\w.-]{1,64}@([\w-]{1,63}(?:\.[\w-]{1,63}){1,8}):(?!\/)\S{1,512}/g, "$1:…")
    .replace(/-----BEGIN [A-Z ]{0,40}PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]{0,40}PRIVATE KEY-----|$)/g, "[private key]")
    .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]{16,255}|github_pat_[A-Za-z0-9_]{20,255})/g, "[token]")
    .replace(/\b(bearer|token|basic)(\s+)[A-Za-z0-9._~+/=-]{8,512}/gi, "$1$2[token]")
    // A secret's value: quoted ({"passcode":"482913"}, "password": "hunter2"), or to the end of the line (it may hold spaces).
    .replace(new RegExp(`\\b(${SECRET_KEYS})\\b(["']?)(\\s*[=:]\\s*|\\s+)(?:"[^"\\n]{0,512}"|'[^'\\n]{0,512}'|[^\\s"'][^\\n]*)`, "gi"), "$1$2$3[redacted]")
    .replace(/(?<![\w.%+-])[\w.%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){0,8}\.[A-Za-z]{2,24}\b/g, "[email]")
    // A device sign-in code (ABCD-1234).
    .replace(/\b[A-Z0-9]{4}-[A-Z0-9]{4}\b/g, "[code]")
    .replace(/[A-Za-z0-9+/_-]{32,}={0,2}/g, "[redacted]")
    // Absolute paths to a quote or the end of the line: C:\… or C:/…, \\server\… or //server/…, and /a/b (MSYS's /c/… too).
    .replace(new RegExp(`(?:\\b[A-Za-z]:[\\\\/]|\\\\\\\\[^\\s\\\\]|(?<![\\w:/])//(?=[^\\s/]))${TO_END}`, "g"), "<path>")
    .replace(new RegExp(`(?<![\\w.:/~<>-])/[^\\s/"'<>]{1,255}/${TO_END}`, "g"), "<path>")
    // Words that end in a note's file name: quoted, the whole quote; otherwise back to the last = : ( or the start.
    .replace(/(["'])[^"'\n]{0,300}?\.(?:md|markdown|txt)\b[^"'\n]{0,300}?\1/gi, "$1<note>$1")
    .replace(/(^|[=:(]\s?)[^"'\n=:(<>|]{0,300}?\.(?:md|markdown|txt)\b/gi, "$1<note>");
}

/**
 * The window's measures a report may name: the app's own (PRF-03's note open, Spotlight's open, and
 * the task tracker's waits, whose targets are fixed command IDs, never a note's name).
 */
export const MEASURE_NAMES: readonly string[] = [
  "fn:note.open", "fn:spotlight.open",
  ...["note.save", "conflict", "import.confirm", "notes.export", "unlock.remember", "unlock.submit", "account.signOut", "workspace.remove", "files.copyItem", "files.import", "repoBackup.private", "repoBackup.public", "feedback.send", "note.print"].map((t) => `focus-notes:${t}`),
  // The first run's waits (PRF-13, D-149): FIRST_RUN_WAITS in first-run-app.ts.
  ...["git", "prepare", "account", "signIn", "identity", "findNotes", "folder", "chooseFolder", "clone", "create", "open", "strength"].map((t) => `focus-notes:firstRun.${t}`),
  // The recovery view's waits (D-212): RECOVER_WAITS in recover-app.ts.
  ...["account", "download", "open", "find", "place", "create"].map((t) => `focus-notes:recover.${t}`),
];
/** A measure's name is kept only if it's on the allow-list. */
export const isMeasureName = (name: string) => MEASURE_NAMES.includes(name);

/** Counts and percentiles of the measures, by name (each measure's name, count, p50, and p95). */
export function summarizeTimings(entries: readonly { name: string; duration: number }[]): TimingSummary[] {
  const by = new Map<string, number[]>();
  for (const e of entries) {
    if (!isMeasureName(e.name) || !Number.isFinite(e.duration) || e.duration < 0) continue;
    const list = by.get(e.name) ?? [];
    list.push(e.duration);
    by.set(e.name, list);
  }
  const pct = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))] ?? 0;
  return [...by].map(([name, d]) => {
    const sorted = [...d].sort((a, b) => a - b);
    return { name, count: d.length, p50: Math.round(pct(sorted, 0.5)), p95: Math.round(pct(sorted, 0.95)) };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

/** Checks timings that came from the window: only the app's own names, and numbers. */
export function parseTimings(value: unknown): TimingSummary[] {
  if (!Array.isArray(value)) return [];
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 1e9 ? Math.round(v) : undefined);
  const out: TimingSummary[] = [];
  for (const t of value.slice(0, REPORT_TIMINGS)) {
    if (!t || typeof t !== "object") continue;
    const { name, count, p50, p95 } = t as Record<string, unknown>;
    const c = n(count), a = n(p50), b = n(p95);
    if (typeof name === "string" && isMeasureName(name) && c !== undefined && a !== undefined && b !== undefined) out.push({ name, count: c, p50: a, p95: b });
  }
  return out;
}

const SETTING_VALUE = /^[a-z0-9][a-z0-9.-]{0,30}$/i;
/** The device settings a report may name: built-in theme IDs as they are, a custom theme as "custom". */
export function settingsSummary(state: Record<string, unknown>): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  const builtIn = new Set(BUILT_IN_THEMES.map((t) => t.id));
  for (const key of ["appearance", "lightTheme", "darkTheme", "contentFont", "fontSize", "uiScale", "lineHeight", "measure", "paragraphSpacing", "focusDim", "focusMode", "firstRun"]) {
    const v = state[key];
    if (v === undefined) continue;
    if (key.endsWith("Theme")) out[key] = typeof v === "string" && builtIn.has(v) ? v : "custom";
    else if (typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v))) out[key] = v;
    else if (typeof v === "string" && SETTING_VALUE.test(v)) out[key] = v;
  }
  return out;
}

const yes = (b: boolean) => (b ? "yes" : "no");
const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d+Z$/, "Z");
const cell = (s: string) => s.replace(/\|/g, "/");

/**
 * The report as Markdown, for an issue or a file. Every value from the facts is redacted with the
 * known strings too; then every line again, without them, so the report's own words ("notes
 * repository") stay readable whatever the repositories are called.
 */
export function buildReport(f: DiagnosticFacts, o: RedactOptions = {}, use: ReportUse = {}): string {
  const w = f.workspace;
  const v = (s: string) => redact(s, o);
  const lines = [
    "## Focus Notes diagnostic report",
    "",
    // Attached to Send feedback, it is being sent: "Nothing was sent." would be untrue (D-203).
    `Made ${iso(f.generatedAt)} on this computer. ${NEVER_INCLUDED}${use.forSend ? "" : " Nothing was sent."}`,
    "",
    "### App",
    `- Focus Notes ${v(f.app.version)}${f.app.packaged ? "" : " (development build)"}`,
    `- OS: ${v(f.os.platform)} ${v(f.os.release)} (${v(f.os.arch)})`,
    `- Electron ${v(f.runtime.electron)}, Chromium ${v(f.runtime.chrome)}, Node ${v(f.runtime.node)}`,
    `- Compositing: ${f.compositing === "gpu" ? "GPU" : "software"}`,
    "",
    "### Git",
    f.git.installed ? `- Git ${v(f.git.version ?? "unknown")} (${f.git.ok ? "new enough" : "too old"})${f.git.bundled ? ", the one that comes with Focus Notes" : ""}` : `- Git: not found${f.git.bundled ? " (the one that comes with Focus Notes doesn't start)" : ""}`,
    `- Git Credential Manager is the credential helper: ${yes(f.git.gcm)}`,
    `- GitHub CLI installed: ${yes(f.git.gh)}`,
    "",
    "### Workspace",
    w.git
      ? `- Saving with Git: ${w.state}${w.problem ? ` (${v(w.problem)})` : ""}, ${w.waiting} change(s) not on GitHub, ${w.conflicts} conflict(s) held`
      : "- Saving with Git: no (the workspace isn't a Git repository)",
    ...w.repositories.map((r) => `- ${r.role} repository: remote ${r.remote}, ${r.branch ? (r.upstream ? "branch with upstream" : "branch without upstream") : "no branch"}, ahead ${r.ahead}, behind ${r.behind}, ${r.changed} changed, ${r.unmerged} unmerged`),
    "",
    "### Unsaved drafts",
    f.journal.notes ? `- Unsaved text for ${f.journal.notes} note(s), ${f.journal.bytes} bytes` : "- Empty: everything is saved",
    "",
    "### Settings",
    ...(Object.keys(f.settings).length ? Object.entries(f.settings).map(([k, value]) => `- ${k}: ${v(String(value))}`) : ["- Defaults"]),
    "",
    "### Timings (ms)",
    ...(f.timings.length
      ? ["| Measure | Count | p50 | p95 |", "| --- | --- | --- | --- |", ...f.timings.filter((t) => isMeasureName(t.name)).slice(0, REPORT_TIMINGS).map((t) => `| ${cell(t.name)} | ${t.count} | ${t.p50} | ${t.p95} |`)]
      : ["- None yet"]),
    "",
    "### Recent problems",
    ...(f.problems.length ? f.problems.slice(-REPORT_PROBLEMS).map((p) => `- ${iso(p.at)} ${v(p.line.slice(0, LINE_MAX))}`) : ["- None since the app started"]),
    "",
  ];
  const patterns: RedactOptions = { ...(o.home ? { home: o.home } : {}), ...(o.workspace ? { workspace: o.workspace } : {}) };
  return lines.map((l) => redact(l, patterns)).join("\n");
}

/** A short summary of each part, for the preview in Settings → About. */
export interface DiagnosticsPreview {
  version: string;
  os: string;
  electron: string;
  git: string;
  helper: "gcm" | "other";
  repositories: number;
  ahead: number;
  behind: number;
  conflicts: number;
  journal: number;
  compositing: "gpu" | "software";
  problems: number;
}

export function previewOf(f: DiagnosticFacts): DiagnosticsPreview {
  const sum = (k: "ahead" | "behind") => f.workspace.repositories.reduce((n, r) => n + r[k], 0);
  const os = f.os.platform === "win32" ? "Windows" : f.os.platform === "darwin" ? "macOS" : f.os.platform === "linux" ? "Linux" : f.os.platform;
  return {
    version: f.app.version, os, electron: f.runtime.electron.split(".")[0] ?? f.runtime.electron,
    git: f.git.installed ? (f.git.version ?? "") : "", helper: f.git.gcm ? "gcm" : "other",
    repositories: f.workspace.repositories.length, ahead: sum("ahead"), behind: sum("behind"), conflicts: f.workspace.conflicts,
    journal: f.journal.notes, compositing: f.compositing, problems: f.problems.length,
  };
}

/** The app's log since it started, in memory only, redacted as each line arrives (D-140). */
export class ProblemLog {
  readonly #lines: Problem[] = [];
  readonly #max: number;
  readonly #opts: () => RedactOptions;
  constructor(max = 200, opts: () => RedactOptions = () => ({})) {
    this.#max = max;
    this.#opts = opts;
  }
  add(line: string, at = Date.now()): void {
    // Cut before and after: redact never reads a long line, and the log keeps short ones.
    this.#lines.push({ at, line: redact(line.slice(0, 1000), this.#opts()).slice(0, LINE_MAX) });
    if (this.#lines.length > this.#max) this.#lines.splice(0, this.#lines.length - this.#max);
  }
  list(): Problem[] {
    return this.#lines.map((p) => ({ ...p }));
  }
}
