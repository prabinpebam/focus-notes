/**
 * Send feedback (QLT-07, D-203): the pure parts both shells share. What the window may send is
 * checked here (types and lengths), and the issue's body, the Continue on GitHub address, the
 * labels, and the problem codes are made here, so the desktop's main process and the browser give
 * the same issue. The repository is fixed: nothing from the window ever names another.
 *
 * The issue's own words (the summary line, the cut note, the marker) are fixed English for the
 * maintainers who read it, as the diagnostic report's are (D-140 (5)).
 */

/** The project's own repository: issues go here and nowhere else. */
export const FEEDBACK_REPO = Object.freeze({ owner: "prabinpebam", name: "focus-notes" });
/** Where its issues live; an issue's address must start with this. */
export const FEEDBACK_ISSUES = `https://github.com/${FEEDBACK_REPO.owner}/${FEEDBACK_REPO.name}/issues/`;
export const FEEDBACK_NEW_ISSUE = `${FEEDBACK_ISSUES}new`;
export const TITLE_MAX = 120;
export const DETAILS_MAX = 5000;
/** Continue on GitHub's address stays under this many characters; longer details are cut. */
export const CONTINUE_URL_MAX = 6000;
/** After a success, another send waits this long, against double posts. */
export const FEEDBACK_COOLDOWN_MS = 30_000;

export type FeedbackKind = "problem" | "idea";
/** What the window sends, and all it can send. */
export interface FeedbackInput {
  kind: FeedbackKind;
  title: string;
  details: string;
  attachReport: boolean;
}
/**
 * Why a send didn't post: `network` (offline, a timeout, GitHub's own error: try again), `expired`
 * (401: sign in again), `refused` (403, 404, 410, 422, rate limits, abuse detection: this sign-in
 * can't open issues there), `signedOut` (no sign-in), `invalid` (the window sent something wrong),
 * `busy` (a send is running or has just finished).
 */
export type FeedbackProblem = "network" | "expired" | "refused" | "signedOut" | "invalid" | "busy";
export const FEEDBACK_PROBLEMS: readonly FeedbackProblem[] = ["network", "expired", "refused", "signedOut", "invalid", "busy"];
export type FeedbackResult = { number: number; url: string } | { problem: FeedbackProblem };
/** What Continue on GitHub put on the clipboard. */
export type FeedbackCopied = "none" | "report" | "details" | "both";

const KEYS = ["attachReport", "details", "kind", "title"];

/** The window's input, checked strictly: exactly these keys, these types, and these lengths. Undefined when it isn't. */
export function validateFeedback(input: unknown): FeedbackInput | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const o = input as Record<string, unknown>;
  if (Object.keys(o).sort().join() !== KEYS.join()) return undefined;
  if (o.kind !== "problem" && o.kind !== "idea") return undefined;
  if (typeof o.title !== "string" || typeof o.details !== "string" || typeof o.attachReport !== "boolean") return undefined;
  const title = o.title.trim();
  if (!title || [...title].length > TITLE_MAX || [...o.details].length > DETAILS_MAX) return undefined;
  return { kind: o.kind, title, details: o.details, attachReport: o.attachReport };
}

/** The labels an issue asks for: GitHub drops them for people who can't push, and the workflow adds them (D-203 (8)). */
export const feedbackLabels = (kind: FeedbackKind): string[] => [kind === "problem" ? "bug" : "enhancement", "from-app"];

/** Where it was sent from: the app's version and the computer's system, in one line. */
export interface FeedbackSystem {
  version: string;
  /** `process.platform` on the desktop; `web` in the browser. */
  platform: string;
  release?: string;
  arch?: string;
}
const OS: Record<string, string> = { win32: "Windows", darwin: "macOS", linux: "Linux", web: "the browser" };
/** "Focus Notes 0.5.0 · Windows 10.0.26100 (x64)". */
export function summaryLine(s: FeedbackSystem): string {
  const os = OS[s.platform] ?? s.platform;
  return `Focus Notes ${s.version} · ${[os, s.release].filter(Boolean).join(" ")}${s.arch ? ` (${s.arch})` : ""}`;
}
/** A marker the labelling workflow looks for; values are only ever the app's own words. */
export function feedbackMarker(kind: FeedbackKind, s: FeedbackSystem): string {
  const safe = (v: string) => v.replace(/[^\w.+-]/g, "").replace(/-{2,}/g, "-");
  return `<!-- focus-notes-feedback: kind=${kind}; app=${safe(s.version)}; platform=${safe(s.platform)} -->`;
}
/** Matches the marker in an issue's body (the workflow's own copy lives in feedback-labels.yml). */
export const FEEDBACK_MARKER = /<!-- focus-notes-feedback: kind=(problem|idea); /;

/**
 * The issue's body: the person's details, a rule, the summary line, the redacted report folded
 * away only when attached, and the marker.
 */
export function issueBody(o: { kind: FeedbackKind; details: string; system: FeedbackSystem; report?: string }): string {
  const parts = [o.details.trim(), "---", summaryLine(o.system)];
  if (o.report) parts.push(`<details><summary>Diagnostic report</summary>\n\n${o.report.trim()}\n\n</details>`);
  parts.push(feedbackMarker(o.kind, o.system));
  return parts.filter(Boolean).join("\n\n");
}

const CUT_NOTE = "*(The rest didn't fit in the link. It's on your clipboard: paste it here.)*";

/**
 * Continue on GitHub: the new-issue form with the title, the details and the summary line, and
 * the labels. Never the report. Details that would take the address past CONTINUE_URL_MAX are cut
 * at a whole character, with a note; `cut` says so, and the caller copies the whole details.
 */
export function continueUrl(o: { kind: FeedbackKind; title: string; details: string; system: FeedbackSystem }): { url: string; cut: boolean } {
  const make = (details: string, cut: boolean) => {
    const body = [details.trim(), cut ? CUT_NOTE : "", "---", summaryLine(o.system)].filter(Boolean).join("\n\n");
    const q = new URLSearchParams({ title: o.title.trim(), body, labels: feedbackLabels(o.kind).join(",") });
    return `${FEEDBACK_NEW_ISSUE}?${q.toString().replace(/\+/g, "%20")}`;
  };
  const whole = make(o.details, false);
  if (whole.length <= CONTINUE_URL_MAX) return { url: whole, cut: false };
  const chars = [...o.details];
  let lo = 0, hi = chars.length;
  // The longest start of the details that fits, by halving.
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (make(chars.slice(0, mid).join(""), true).length <= CONTINUE_URL_MAX) lo = mid;
    else hi = mid - 1;
  }
  return { url: make(chars.slice(0, lo).join(""), true), cut: true };
}

/** An issue's address from GitHub is shown only when it's an issue of the project's repository. */
export function issueUrlOk(url: unknown): url is string {
  if (typeof url !== "string" || !url.startsWith(FEEDBACK_ISSUES)) return false;
  return /^\d+$/.test(url.slice(FEEDBACK_ISSUES.length));
}

/**
 * GitHub's answer as a problem code: offline (0), a timeout, or GitHub's own error is `network`;
 * 401 `expired`; anything else it refused (403, 404, 410, 422, 429, abuse detection) is `refused`.
 */
export function feedbackProblem(status: number): FeedbackProblem {
  if (status === 0 || status === 408 || status >= 500) return "network";
  if (status === 401) return "expired";
  return "refused";
}
