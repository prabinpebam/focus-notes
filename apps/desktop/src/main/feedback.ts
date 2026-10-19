/**
 * Send feedback in the main process (QLT-07, D-203). The window sends only the person's kind, title,
 * details and whether to attach the report; everything else is decided here:
 * - the repository is FEEDBACK_REPO, a constant: nothing from the window can name another;
 * - the token stays inside the account's API client and never comes back;
 * - the report is built and redacted here (D-140), shown to the person as its preview, and that same
 *   text, kept here, is what goes into the issue, or onto the clipboard for Continue on GitHub, never
 *   into an address: what's posted can't differ from what was seen;
 * - one send at a time, none for 30 seconds after a success (against double posts), none for 5
 *   seconds after a failure, and at most 5 issues an hour from one run of the app.
 * Only the report's preview, an issue's number and address, a problem code, or what was copied go
 * back to the window.
 */
import {
  continueUrl,
  FEEDBACK_COOLDOWN_MS,
  FEEDBACK_FAILED_WAIT_MS,
  FEEDBACK_HOURLY_MAX,
  FEEDBACK_REPO,
  feedbackLabels,
  feedbackProblem,
  issueBody,
  issueUrlOk,
  validateFeedback,
  type FeedbackCopied,
  type FeedbackResult,
  type FeedbackSystem,
} from "@focus-notes/core/feedback";

/** What opening an issue needs: the signed-in account's client, which keeps its token to itself. */
export interface IssueClient {
  createIssue(owner: string, repo: string, issue: { title: string; body: string; labels: string[] }): Promise<{ number: number; url: string }>;
}

export interface FeedbackDeps {
  /** The signed-in account's client, or undefined when no one is signed in. */
  client(): Promise<IssueClient | undefined>;
  /** The redacted diagnostic report, with the window's timings (checked again there); `forSend` when it's to be posted. */
  report(timings: unknown, use: { forSend: boolean }): Promise<string>;
  system: FeedbackSystem;
  copy(text: string): void;
  open(url: string): Promise<void>;
  now?: () => number;
}

/** A GitHub answer's status, or 0 for anything else (offline, a timeout, a reply that wasn't JSON). */
const statusOf = (e: unknown): number => (e && typeof e === "object" && typeof (e as { status?: unknown }).status === "number" ? (e as { status: number }).status : 0);

export function feedbackMain(d: FeedbackDeps) {
  const now = d.now ?? Date.now;
  let sending = false;
  let lastSent = -Infinity;
  let lastFailed = -Infinity;
  /** When this run's issues were opened, for the hourly cap. */
  let sent: number[] = [];
  /** The report last previewed: the exact text that's posted or copied (D-203). */
  let shown: string | undefined;
  let generation = 0;

  return {
    /** Builds the report to attach, keeps it, and returns it for the preview; a newer preview replaces it. */
    async preview(timings: unknown): Promise<string> {
      const g = ++generation;
      const text = await d.report(timings, { forSend: true });
      if (g === generation) shown = text;
      return text;
    },

    async send(raw: unknown): Promise<FeedbackResult> {
      const input = validateFeedback(raw);
      if (!input) return { problem: "invalid" };
      if (sending || now() - lastSent < FEEDBACK_COOLDOWN_MS) return { problem: "busy" };
      if (now() - lastFailed < FEEDBACK_FAILED_WAIT_MS) return { problem: "wait" };
      sent = sent.filter((t) => now() - t < 3_600_000);
      if (sent.length >= FEEDBACK_HOURLY_MAX) return { problem: "limit" };
      // Attached, it's the report the person saw, or nothing goes.
      const report = input.attachReport ? shown : undefined;
      if (input.attachReport && !report) return { problem: "invalid" };
      sending = true;
      try {
        const client = await d.client();
        if (!client) return { problem: "signedOut" };
        const body = issueBody({ kind: input.kind, details: input.details, system: d.system, ...(report ? { report } : {}) });
        const issue = await client.createIssue(FEEDBACK_REPO.owner, FEEDBACK_REPO.name, { title: input.title, body, labels: feedbackLabels(input.kind) });
        if (!Number.isSafeInteger(issue.number) || issue.number < 1) {
          lastFailed = now();
          return { problem: "network" };
        }
        lastSent = now();
        sent.push(lastSent);
        shown = undefined;
        // An address that isn't one of the project's issues is never passed on.
        return { number: issue.number, url: issueUrlOk(issue.url) ? issue.url : "" };
      } catch (e) {
        lastFailed = now();
        return { problem: feedbackProblem(statusOf(e)) };
      } finally {
        sending = false;
      }
    },

    /** Opens GitHub's new-issue form; the report (when attached) and cut details go to the clipboard, never the address. */
    async continue(raw: unknown): Promise<FeedbackCopied> {
      const input = validateFeedback(raw);
      if (!input) return "none";
      const { url, cut } = continueUrl({ kind: input.kind, title: input.title, details: input.details, system: d.system });
      const report = input.attachReport ? shown : undefined;
      const parts = [cut ? input.details : "", report ? `<details><summary>Diagnostic report</summary>\n\n${report.trim()}\n\n</details>` : ""].filter(Boolean);
      if (parts.length) d.copy(parts.join("\n\n"));
      await d.open(url);
      return report && cut ? "both" : report ? "report" : cut ? "details" : "none";
    },
  };
}
