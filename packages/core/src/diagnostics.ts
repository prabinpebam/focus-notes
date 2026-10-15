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
  git: { installed: boolean; version?: string; ok: boolean; gcm: boolean; gh: boolean };
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
/**
 * Report a problem: the project's new-issue form with a fixed template. The report itself goes on
 * the clipboard for the person to paste and read, never in the address, so opening the form sends
 * GitHub nothing of it (D-55, D-140).
 */
export const REPORT_PROBLEM_URL = `https://github.com/prabinpebam/focus-notes/issues/new?labels=bug&body=${encodeURIComponent(
  "**What happened?**\n\n\n**What did you expect?**\n\n\n<!-- Focus Notes put its diagnostic report on your clipboard. Paste it below and read it before you submit. -->\n",
)}`;
/** At most this many of the latest problems and timings go in a report. */
export const REPORT_PROBLEMS = 50;
export const REPORT_TIMINGS = 40;
const LINE_MAX = 200;

export interface RedactOptions {
  /** Exact strings that must never appear (a known secret, the person's login), 4 characters or more. */
  known?: readonly string[];
  /** Folders whose paths are replaced: the home folder by `~`, the workspace by `<workspace>`. */
  home?: string;
  workspace?: string;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** A folder in both slash styles, case-insensitively, as Windows spells it either way. */
const folderPattern = (dir: string) => {
  const trimmed = dir.replace(/[\\/]+$/, "");
  if (trimmed.length < 3) return undefined;
  const parts = trimmed.split(/[\\/]+/).map(escape);
  return new RegExp(parts.join("[\\\\/]+"), "gi");
};

/**
 * Takes out anything secret or personal from a line of text. In order: known strings; the
 * workspace's and the home folder's paths; credentials in addresses; GitHub tokens and other bearer
 * tokens; `password=…`-style pairs; private keys; email addresses; long runs of base64 or hex;
 * remaining absolute paths; and Markdown file names.
 */
export function redact(text: string, o: RedactOptions = {}): string {
  let s = text;
  for (const k of [...(o.known ?? [])].filter((k) => k.length >= 4).sort((a, b) => b.length - a.length)) s = s.split(k).join("[redacted]");
  const ws = o.workspace ? folderPattern(o.workspace) : undefined;
  if (ws) s = s.replace(ws, "<workspace>");
  const home = o.home ? folderPattern(o.home) : undefined;
  if (home) s = s.replace(home, "~");
  return s
    // https://user:token@host → https://[redacted]@host
    .replace(/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, "$1[redacted]@")
    // An address keeps its host only: a repository's path names its owner. So does Git's SSH form (git@host:owner/repo).
    .replace(/\b([a-z][a-z0-9+.-]*:\/\/(?:\[redacted\]@)?[^\s/]+)\/\S*/gi, "$1/…")
    .replace(/\b[\w.-]+@([\w-]+(?:\.[\w-]+)+):(?!\/)\S+/g, "$1:…")
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g, "[private key]")
    .replace(/\b(gh[pousr]_[A-Za-z0-9_]{16,}|github_pat_[A-Za-z0-9_]{20,})/g, "[token]")
    .replace(/\b(bearer|token|basic)(\s+)[A-Za-z0-9._~+/=-]{8,}/gi, "$1$2[token]")
    // A secret's value runs to the end of the line: it may hold spaces.
    .replace(/\b(password|passwd|passcode|passphrase|secret|token|api[_-]?key|key|authorization)(\s*[=:]\s*)("[^"]*"|'[^']*'|\S.*)/gi, "$1$2[redacted]")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]")
    .replace(/[A-Za-z0-9+/_-]{32,}={0,2}/g, "[redacted]")
    // Windows paths (C:\…, \\server\…) and home folders on macOS and Linux.
    .replace(/(?:\b[A-Za-z]:|\\\\[^\s\\]+)\\[^\s"'<>|]*/g, "<path>")
    .replace(/\/(?:Users|home|root|mnt|media|Volumes|tmp|var|private)(?:\/[^\s"'<>]*)?/g, "<path>")
    .replace(/[^\s"'<>/\\]+\.(md|markdown|txt)\b/gi, "<note>");
}

/** A measure's name is only kept if it's one of the app's own: a short dotted identifier. */
export const isMeasureName = (name: string) => /^[a-z][a-zA-Z0-9]*(?:[.:-][a-zA-Z0-9]+){0,5}$/.test(name) && name.length <= 60;

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

/** The report as Markdown, for an issue or a file. Every line is redacted. */
export function buildReport(f: DiagnosticFacts, o: RedactOptions = {}): string {
  const w = f.workspace;
  const lines = [
    "## Focus Notes diagnostic report",
    "",
    `Made ${iso(f.generatedAt)} on this computer. ${NEVER_INCLUDED} Nothing was sent.`,
    "",
    "### App",
    `- Focus Notes ${f.app.version}${f.app.packaged ? "" : " (development build)"}`,
    `- OS: ${f.os.platform} ${f.os.release} (${f.os.arch})`,
    `- Electron ${f.runtime.electron}, Chromium ${f.runtime.chrome}, Node ${f.runtime.node}`,
    `- Compositing: ${f.compositing === "gpu" ? "GPU" : "software"}`,
    "",
    "### Git",
    f.git.installed ? `- Git ${f.git.version ?? "unknown"} (${f.git.ok ? "new enough" : "too old"})` : "- Git: not found",
    `- Git Credential Manager is the credential helper: ${yes(f.git.gcm)}`,
    `- GitHub CLI installed: ${yes(f.git.gh)}`,
    "",
    "### Workspace",
    w.git
      ? `- Saving with Git: ${w.state}${w.problem ? ` (${w.problem})` : ""}, ${w.waiting} change(s) not on GitHub, ${w.conflicts} conflict(s) held`
      : "- Saving with Git: no (the workspace isn't a Git repository)",
    ...w.repositories.map((r) => `- ${r.role} repository: remote ${r.remote}, ${r.branch ? (r.upstream ? "branch with upstream" : "branch without upstream") : "no branch"}, ahead ${r.ahead}, behind ${r.behind}, ${r.changed} changed, ${r.unmerged} unmerged`),
    "",
    "### Recovery journal",
    f.journal.notes ? `- Unsaved text for ${f.journal.notes} note(s), ${f.journal.bytes} bytes` : "- Empty: everything is saved",
    "",
    "### Settings",
    ...(Object.keys(f.settings).length ? Object.entries(f.settings).map(([k, v]) => `- ${k}: ${String(v)}`) : ["- Defaults"]),
    "",
    "### Timings (ms)",
    ...(f.timings.length
      ? ["| Measure | Count | p50 | p95 |", "| --- | --- | --- | --- |", ...f.timings.slice(0, REPORT_TIMINGS).map((t) => `| ${cell(t.name)} | ${t.count} | ${t.p50} | ${t.p95} |`)]
      : ["- None yet"]),
    "",
    "### Recent problems",
    ...(f.problems.length ? f.problems.slice(-REPORT_PROBLEMS).map((p) => `- ${iso(p.at)} ${p.line.slice(0, LINE_MAX)}`) : ["- None since the app started"]),
    "",
  ];
  return lines.map((l) => redact(l, o)).join("\n");
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
    this.#lines.push({ at, line: redact(line, this.#opts()).slice(0, LINE_MAX) });
    if (this.#lines.length > this.#max) this.#lines.splice(0, this.#lines.length - this.#max);
  }
  list(): Problem[] {
    return this.#lines.map((p) => ({ ...p }));
  }
}
