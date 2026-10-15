/**
 * The diagnostic report in the main process (QLT-04, D-55, D-140): facts gathered from the app,
 * Git, the workspace's repositories, the recovery journal, and the app's own log in memory, then
 * built and redacted by `@focus-notes/core/diagnostics`. Nothing here reads a note, a credential,
 * or `access.json`, and nothing is sent: the person copies or saves the report and decides.
 */
import { buildReport, parseTimings, previewOf, settingsSummary, type DiagnosticFacts, type DiagnosticsPreview, type ProblemLog, type RedactOptions, type RepoHealth } from "@focus-notes/core/diagnostics";
import type { SyncReport } from "@focus-notes/core";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

export interface DiagnosticsDeps {
  app: { version: string; packaged: boolean };
  os: { platform: string; release: string; arch: string };
  runtime: { electron: string; chrome: string; node: string };
  /** Git's version and helpers, from `git` alone (no network). */
  git: () => Promise<{ installed: boolean; version?: string; ok: boolean; gcm: boolean; gh: boolean }>;
  /** The workspace's Git, or undefined when it isn't a repository. */
  sync: () => Promise<{ report: SyncReport; repositories: RepoHealth[]; conflicts: number } | undefined>;
  /** The texts the recovery journal holds now: only their count and size are reported. */
  journal: () => readonly { text: string }[];
  compositing: () => "gpu" | "software";
  /** Device settings (`state.json`): only `settingsSummary`'s values are reported. */
  state: () => Promise<Record<string, unknown>>;
  log: ProblemLog;
  redaction: () => RedactOptions;
  /** Brings the known strings up to date before a report is built. */
  refresh?: () => Promise<void>;
  now?: () => number;
}

export function diagnostics(d: DiagnosticsDeps) {
  const facts = async (timings: unknown): Promise<DiagnosticFacts> => {
    await d.refresh?.().catch(() => {});
    const [git, sync, state] = await Promise.all([
      d.git().catch(() => ({ installed: false, ok: false, gcm: false, gh: false })),
      d.sync().catch(() => undefined),
      d.state().catch(() => ({})),
    ]);
    const texts = d.journal();
    return {
      generatedAt: (d.now ?? Date.now)(),
      app: d.app, os: d.os, runtime: d.runtime, git,
      workspace: sync
        ? { git: true, state: sync.report.state, ...(sync.report.problem ? { problem: sync.report.problem } : {}), waiting: sync.report.waiting, conflicts: sync.conflicts, repositories: sync.repositories }
        : { git: false, state: "idle", waiting: 0, conflicts: 0, repositories: [] },
      journal: { notes: texts.length, bytes: texts.reduce((n, e) => n + Buffer.byteLength(e.text), 0) },
      compositing: d.compositing(),
      settings: settingsSummary(state),
      timings: parseTimings(timings),
      problems: d.log.list(),
    };
  };
  return {
    preview: async (): Promise<DiagnosticsPreview> => previewOf(await facts([])),
    /** The report, redacted. `timings` comes from the window and is checked again here. */
    report: async (timings: unknown): Promise<string> => buildReport(await facts(timings), d.redaction()),
  };
}

/** The report's file name: the date only, never a note's or the person's name. */
export const reportFileName = (now: number) => `focus-notes-diagnostics-${new Date(now).toISOString().slice(0, 10)}.md`;

/**
 * The strings a report must never hold, whatever the facts say (D-140): the GitHub login and name,
 * Git's user.name and user.email, the setup's repository names, and each remote's owner and
 * repository name (from `https://github.com/owner/repo.git`, `git@github.com:owner/repo.git`, or a
 * local path). Three characters or more, each once.
 */
export function knownStrings(values: readonly (string | undefined)[], remotes: readonly string[]): string[] {
  const out = new Set<string>();
  const add = (v: string | undefined) => {
    const s = v?.trim();
    if (s && s.length >= 3 && s.length <= 200) out.add(s);
  };
  values.forEach(add);
  for (const url of remotes) {
    const parts = url.trim().replace(/\.git\/?$/i, "").split(/[\\/:]+/).filter(Boolean);
    add(parts.at(-1));
    if (parts.length >= 2) add(parts.at(-2));
  }
  return [...out];
}

/**
 * Where a saved report may go: never inside the workspace (it would be committed, and published if
 * public) or the app's data folder. Compared case-insensitively where the file system is, and
 * through the real folder when it exists (a junction or link into the workspace counts as inside).
 */
export function reportPathAllowed(file: string, forbidden: readonly string[], o: { caseInsensitive?: boolean; real?: (p: string) => string | undefined } = {}): boolean {
  const ci = o.caseInsensitive ?? (process.platform === "win32" || process.platform === "darwin");
  const norm = (p: string) => {
    const r = resolve(p);
    return ci ? r.toLowerCase() : r;
  };
  const real = (p: string) => o.real?.(p) ?? p;
  const target = [norm(file), norm(join(real(dirname(file)), basename(file)))];
  return forbidden.every((base) => [norm(base), norm(real(base))].every((b) => target.every((t) => {
    const rel = relative(b, t);
    return rel.startsWith("..") || isAbsolute(rel);
  })));
}
