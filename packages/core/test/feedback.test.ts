/**
 * Send feedback (QLT-07, D-203): what the window may send, the issue's body, Continue on GitHub's
 * address, the problem codes, and the dialog's state in the app: the kind and attach defaults, the
 * draft kept until sent, one send at a time with a 30 s wait after a success, and the browser's
 * Continue-only route.
 */
import { describe, expect, it } from "vitest";
import {
  continueUrl,
  CONTINUE_URL_MAX,
  DETAILS_MAX,
  FEEDBACK_COOLDOWN_MS,
  FEEDBACK_ISSUES,
  FEEDBACK_MARKER,
  FEEDBACK_NEW_ISSUE,
  FEEDBACK_REPO,
  feedbackLabels,
  feedbackMarker,
  feedbackProblem,
  issueBody,
  issueUrlOk,
  summaryLine,
  TITLE_MAX,
  validateFeedback,
  type FeedbackInput,
  type FeedbackResult,
} from "../src/feedback.ts";
import { createApp, type PlatformBridge } from "../src/index.ts";
import type { Clock } from "../src/tasks.ts";
import type { FirstRunBridge } from "../src/first-run.ts";
import en from "../../views/messages/en.json" with { type: "json" };

const ok: FeedbackInput = { kind: "problem", title: "Crash on save", details: "It closed.", attachReport: true };
const system = { version: "0.5.0", platform: "win32", release: "10.0.26100", arch: "x64" };

describe("what the window may send", () => {
  it("takes exactly kind, title, details and attachReport, with the title trimmed", () => {
    expect(validateFeedback({ ...ok, title: "  Crash on save \n" })).toEqual(ok);
    expect(validateFeedback({ ...ok, kind: "idea", attachReport: false })).toEqual({ ...ok, kind: "idea", attachReport: false });
  });
  it("refuses wrong types, missing or extra keys, and other kinds", () => {
    for (const bad of [
      null, undefined, "x", 1, [], [ok],
      { ...ok, kind: "bug" }, { ...ok, title: 7 }, { ...ok, details: null }, { ...ok, attachReport: "yes" },
      { kind: "problem", title: "t", details: "" },
      { ...ok, repo: "someone/else" }, { ...ok, owner: "evil" }, { ...ok, url: "https://evil.example" },
    ]) expect(validateFeedback(bad)).toBeUndefined();
  });
  it("needs a title, and keeps to the limits in characters, not UTF-16 units", () => {
    expect(validateFeedback({ ...ok, title: "   " })).toBeUndefined();
    expect(validateFeedback({ ...ok, title: "😀".repeat(TITLE_MAX) })?.title).toHaveLength(TITLE_MAX * 2);
    expect(validateFeedback({ ...ok, title: "a".repeat(TITLE_MAX + 1) })).toBeUndefined();
    expect(validateFeedback({ ...ok, details: "a".repeat(DETAILS_MAX) })).toBeDefined();
    expect(validateFeedback({ ...ok, details: "a".repeat(DETAILS_MAX + 1) })).toBeUndefined();
  });
});

describe("the issue", () => {
  it("goes to the project's own repository, with the kind's labels", () => {
    expect(FEEDBACK_REPO).toEqual({ owner: "prabinpebam", name: "focus-notes" });
    expect(Object.isFrozen(FEEDBACK_REPO)).toBe(true);
    expect(feedbackLabels("problem")).toEqual(["bug", "from-app"]);
    expect(feedbackLabels("idea")).toEqual(["enhancement", "from-app"]);
  });
  it("has the details, a rule, the summary line and the marker; the report only when attached", () => {
    const body = issueBody({ kind: "problem", details: "It closed.\n", system });
    expect(body).toBe("It closed.\n\n---\n\nFocus Notes 0.5.0 · Windows 10.0.26100 (x64)\n\n<!-- focus-notes-feedback: kind=problem; app=0.5.0; platform=win32 -->");
    expect(body).not.toContain("Diagnostic report");
    expect(FEEDBACK_MARKER.exec(body)?.[1]).toBe("problem");
    const withReport = issueBody({ kind: "problem", details: "", system, report: "# Report\nfacts" });
    expect(withReport).toContain("<details><summary>Diagnostic report</summary>\n\n# Report\nfacts\n\n</details>");
    expect(withReport.indexOf("</details>")).toBeLessThan(withReport.indexOf("<!-- focus-notes-feedback"));
  });
  it("keeps the marker to the app's own words", () => {
    expect(feedbackMarker("idea", { version: "1.0 --> <script>", platform: "web" })).toBe("<!-- focus-notes-feedback: kind=idea; app=1.0-script; platform=web -->");
    expect(summaryLine({ version: "web", platform: "web" })).toBe("Focus Notes web · the browser");
  });
});

describe("Continue on GitHub", () => {
  const params = (url: string) => new URL(url).searchParams;
  it("opens the new-issue form with the title, the details and summary, and the labels", () => {
    const { url, cut } = continueUrl({ kind: "idea", title: "Dark mode & more?", details: "Please + thanks", system });
    expect(cut).toBe(false);
    expect(url.startsWith(`${FEEDBACK_NEW_ISSUE}?`)).toBe(true);
    expect(url).not.toContain("+");
    expect(params(url).get("title")).toBe("Dark mode & more?");
    expect(params(url).get("body")).toBe("Please + thanks\n\n---\n\nFocus Notes 0.5.0 · Windows 10.0.26100 (x64)");
    expect(params(url).get("labels")).toBe("enhancement,from-app");
    expect([...params(url).keys()].sort()).toEqual(["body", "labels", "title"]);
  });
  it("cuts long details at a whole character, with a note, under the cap", () => {
    const details = "é😀 word ".repeat(DETAILS_MAX / 8);
    const { url, cut } = continueUrl({ kind: "problem", title: "T", details, system });
    expect(cut).toBe(true);
    expect(url.length).toBeLessThanOrEqual(CONTINUE_URL_MAX);
    const body = params(url).get("body")!;
    expect(body).toContain("It's on your clipboard");
    expect(body).not.toContain("\uFFFD");
    expect(details.startsWith(body.split("\n\n")[0]!.trim())).toBe(true);
  });
});

describe("GitHub's answers", () => {
  it("shows an issue's address only when it's one of the project's issues", () => {
    expect(issueUrlOk(`${FEEDBACK_ISSUES}42`)).toBe(true);
    for (const bad of [undefined, 42, `${FEEDBACK_ISSUES}`, `${FEEDBACK_ISSUES}42/x`, `${FEEDBACK_ISSUES}42?x`, "https://github.com/prabinpebam/focus-notes-evil/issues/1", "http://github.com/prabinpebam/focus-notes/issues/1", "https://evil.example/prabinpebam/focus-notes/issues/1"]) expect(issueUrlOk(bad)).toBe(false);
  });
  it("maps each status to a problem code", () => {
    expect([0, 408, 500, 502, 503].map(feedbackProblem)).toEqual(["network", "network", "network", "network", "network"]);
    expect(feedbackProblem(401)).toBe("expired");
    expect([403, 404, 410, 422, 429].map(feedbackProblem)).toEqual(["refused", "refused", "refused", "refused", "refused"]);
  });
  it("has words for every problem code", () => {
    for (const p of ["network", "expired", "refused", "signedOut", "invalid", "busy"]) expect((en as Record<string, string>)[`feedback.problem.${p}`]).toBeTruthy();
  });
});

const settle = () => new Promise((r) => setTimeout(r, 0));

function fakeClock() {
  let t = 1_000_000;
  const timers: { at: number; fn: () => void }[] = [];
  const clock: Clock = {
    now: () => t,
    setTimeout: (fn, ms) => {
      const h = { at: t + ms, fn };
      timers.push(h);
      return h;
    },
    clearTimeout: (h) => void timers.splice(timers.indexOf(h as never), 1),
  };
  const advance = (ms: number) => {
    t += ms;
    for (const h of timers.filter((x) => x.at <= t)) {
      timers.splice(timers.indexOf(h), 1);
      h.fn();
    }
  };
  return { clock, advance };
}

function shell(o: { desktop?: boolean; signedIn?: boolean; answer?: () => Promise<FeedbackResult> } = {}) {
  const desktop = o.desktop ?? true;
  const sent: FeedbackInput[] = [];
  const continued: FeedbackInput[] = [];
  const opened: string[] = [];
  const copied: string[] = [];
  const { clock, advance } = fakeClock();
  const bridge: PlatformBridge = {
    platform: desktop ? "windows" : "web",
    readNote: async () => "# A\n",
    writeNote: async () => {},
    chooseNote: async () => undefined,
    newNotePath: async () => "/w/notes/Untitled.md",
    defaultNotePath: async () => "/w/notes/a.md",
    loadAppState: async () => ({ version: 1, firstRun: "done", lastNotePath: "/w/notes/a.md" }),
    saveAppState: async () => {},
    systemScheme: () => "light",
    onSystemSchemeChange: () => () => {},
    openExternal: (url: string) => void opened.push(url),
    copyText: async (text: string) => void copied.push(text),
    ...(desktop
      ? {
          diagnostics: {
            preview: async () => ({ app: { title: "App", detail: "0.5.0" }, git: { title: "Git", detail: "ok" }, workspace: { title: "W", detail: "" }, journal: { title: "J", detail: "" }, compositing: { title: "C", detail: "" }, problems: { title: "P", detail: "" } }),
            copy: async () => {},
            save: async () => true,
          },
          feedback: {
            send: async (i: FeedbackInput) => (sent.push(i), (o.answer ?? (async () => ({ number: 7, url: `${FEEDBACK_ISSUES}7` })))()),
            continue: async (i: FeedbackInput) => (continued.push(i), i.attachReport ? "report" : "none"),
          },
          // Only the account matters here; the rest of the first run answers nothing.
          firstRun: new Proxy({ account: async () => (o.signedIn ?? true ? { account: { login: "ada", id: 1, name: "Ada" }, gcm: true, gh: false } : { gcm: true, gh: false }) } as Record<string, unknown>, {
            get: (target, key: string) => target[key] ?? (key.startsWith("on") ? () => () => {} : async () => undefined),
          }) as unknown as FirstRunBridge,
        }
      : {}),
  } as PlatformBridge;
  const app = createApp(bridge, en, "en", { clock });
  const vm = () => app.viewModels.select("vm.sendFeedback", app.store.state) as Record<string, any>;
  const toasts = () => (app.viewModels.select("vm.feedback", app.store.state) as { toasts: { message: string }[] }).toasts.map((t) => t.message);
  const run = (id: string, args?: Record<string, unknown>) => app.commands.run(id, args);
  return { app, vm, run, sent, continued, opened, copied, toasts, advance };
}

async function started(o?: Parameters<typeof shell>[0]) {
  const t = shell(o);
  await t.app.start();
  await settle();
  return t;
}

describe("the dialog (D-203)", () => {
  it("opens on Problem with the report attached; Idea leaves it off, unless the person chose", async () => {
    const t = await started();
    await t.run("feedback.open");
    expect(t.vm()).toMatchObject({ open: true, kind: "problem", attach: true, canAttach: true, canPost: true, whoTitle: "@ada", primaryLabel: "Send", primaryDisabled: true, primaryReason: "Add a title first.", busy: false, busyLabel: "" });
    await t.run("feedback.setKind", { value: "idea" });
    expect(t.vm()).toMatchObject({ kind: "idea", attach: false, titlePlaceholder: "Your idea, in a few words" });
    await t.run("feedback.toggleAttach");
    await t.run("feedback.setKind", { value: "problem" });
    await t.run("feedback.setKind", { value: "idea" });
    expect(t.vm().attach).toBe(true);
  });
  it("opens on the kind asked for: Report a problem opens on Problem", async () => {
    const t = await started();
    await t.run("feedback.open", { kind: "idea" });
    expect(t.vm()).toMatchObject({ kind: "idea", attach: false });
    await t.run("feedback.setOpen", { open: false });
    await t.run("diagnostics.reportProblem");
    expect(t.vm()).toMatchObject({ open: true, kind: "problem", attach: true });
  });
  it("keeps the draft when closed and opened again, and says what's too long", async () => {
    const t = await started();
    await t.run("feedback.open");
    await t.run("feedback.setTitle", { value: "a".repeat(TITLE_MAX + 1) });
    expect(t.vm()).toMatchObject({ titleInvalid: true, titleError: `At most ${TITLE_MAX} characters.`, primaryDisabled: true });
    await t.run("feedback.setTitle", { value: "Crash" });
    await t.run("feedback.setDetails", { value: "On save." });
    await t.run("feedback.setOpen", { open: false });
    expect(t.vm().open).toBe(false);
    await t.run("feedback.open");
    expect(t.vm()).toMatchObject({ title: "Crash", details: "On save.", primaryDisabled: false });
  });
  it("sends, shows the issue, clears the draft, and waits 30 s before another", async () => {
    const t = await started();
    await t.run("feedback.open");
    await t.run("feedback.setTitle", { value: "  Crash  " });
    await t.run("feedback.setDetails", { value: "On save." });
    await t.run("feedback.submit");
    expect(t.sent).toEqual([{ kind: "problem", title: "Crash", details: "On save.", attachReport: true }]);
    expect(t.vm()).toMatchObject({ stage: "sent", sent: true, issueTitle: "Issue #7", canOpenIssue: true });
    await t.run("feedback.openIssue");
    expect(t.opened).toEqual([`${FEEDBACK_ISSUES}7`]);
    await t.run("feedback.done");
    await t.run("feedback.open");
    expect(t.vm()).toMatchObject({ stage: "editing", title: "", details: "", kind: "problem" });
    await t.run("feedback.setTitle", { value: "Again" });
    expect(t.vm()).toMatchObject({ primaryDisabled: true, primaryReason: "Sent just now. Wait a moment." });
    await t.run("feedback.send");
    expect(t.sent).toHaveLength(1);
    t.advance(FEEDBACK_COOLDOWN_MS);
    expect(t.vm().primaryDisabled).toBe(false);
  });
  it("hides an issue address that isn't the project's", async () => {
    const t = await started({ answer: async () => ({ number: 9, url: "https://evil.example/9" }) });
    await t.run("feedback.open");
    await t.run("feedback.setTitle", { value: "x" });
    await t.run("feedback.send");
    expect(t.vm()).toMatchObject({ sent: true, canOpenIssue: false });
  });
  it("sends one at a time, and a send closed away ends in a toast", async () => {
    let finish!: (r: FeedbackResult) => void;
    const t = await started({ answer: () => new Promise((r) => (finish = r)) });
    await t.run("feedback.open");
    await t.run("feedback.setTitle", { value: "x" });
    const sending = t.run("feedback.send");
    await settle();
    expect(t.vm()).toMatchObject({ sending: true, busy: true, busyLabel: "Sending…" });
    await t.run("feedback.setTitle", { value: "changed" });
    await t.run("feedback.send");
    expect(t.sent).toHaveLength(1);
    expect(t.vm().title).toBe("x");
    await t.run("feedback.setOpen", { open: false });
    finish({ number: 12, url: `${FEEDBACK_ISSUES}12` });
    await sending;
    expect(t.toasts()).toContain("Feedback sent as issue #12.");
    expect(t.vm()).toMatchObject({ open: false, title: "" });
  });
  it("keeps the draft when it fails: Try again for the network, sign in again when expired, Continue when refused", async () => {
    let answer: FeedbackResult = { problem: "network" };
    const t = await started({ answer: async () => answer });
    await t.run("feedback.open");
    await t.run("feedback.setTitle", { value: "x" });
    await t.run("feedback.send");
    expect(t.vm()).toMatchObject({ hasProblem: true, problem: "Couldn't reach GitHub. Your feedback is still here.", primaryLabel: "Try again", offerContinue: true, title: "x" });
    answer = { problem: "expired" };
    await t.run("feedback.submit");
    expect(t.vm()).toMatchObject({ problem: "Your GitHub sign-in has expired.", canSignIn: true, primaryLabel: "Continue on GitHub", offerContinue: false });
    // Expired, the primary continues on GitHub: Try again isn't offered.
    t.app.store.update((s) => ({ ...s, ui: { ...s.ui, feedback: { ...s.ui.feedback, problem: undefined } } }));
    answer = { problem: "refused" };
    await t.run("feedback.retry");
    expect(t.sent).toHaveLength(3);
    expect(t.vm()).toMatchObject({ problem: "GitHub didn't accept it from this sign-in.", primaryLabel: "Continue on GitHub", canSignIn: false });
    await t.run("feedback.submit");
    expect(t.continued).toEqual([{ kind: "problem", title: "x", details: "", attachReport: true }]);
    expect(t.toasts()).toContain("Report copied. Paste it into the issue.");
    expect(t.vm()).toMatchObject({ open: false, title: "x" });
  });
  it("a send that throws is a network problem", async () => {
    const t = await started({ answer: async () => { throw new Error("boom"); } });
    await t.run("feedback.open");
    await t.run("feedback.setTitle", { value: "x" });
    await t.run("feedback.send");
    expect(t.vm()).toMatchObject({ hasProblem: true, primaryLabel: "Try again" });
  });
  it("signed out on the desktop, it only continues on GitHub", async () => {
    const t = await started({ signedIn: false });
    await t.run("feedback.open");
    expect(t.vm()).toMatchObject({ canPost: false, continues: true, whoTitle: "Continues on GitHub", primaryLabel: "Continue on GitHub" });
    await t.run("feedback.setTitle", { value: "x" });
    await t.run("feedback.submit");
    expect(t.sent).toHaveLength(0);
    expect(t.continued).toHaveLength(1);
  });
});

describe("in the browser (D-80, PKG-05)", () => {
  it("continues on GitHub only, with no report, and copies details that don't fit", async () => {
    const t = await started({ desktop: false });
    await t.run("feedback.open");
    expect(t.vm()).toMatchObject({ canAttach: false, attach: false, canPost: false, primaryLabel: "Continue on GitHub" });
    await t.run("feedback.setKind", { value: "idea" });
    await t.run("feedback.setTitle", { value: "Tags" });
    await t.run("feedback.setDetails", { value: "Please." });
    await t.run("feedback.submit");
    expect(t.opened).toHaveLength(1);
    const url = new URL(t.opened[0]!);
    expect(`${url.origin}${url.pathname}`).toBe(FEEDBACK_NEW_ISSUE);
    expect(url.searchParams.get("title")).toBe("Tags");
    expect(url.searchParams.get("body")).toContain("Focus Notes web · the browser");
    expect(t.copied).toEqual([]);
    await t.run("feedback.open");
    await t.run("feedback.setDetails", { value: "é".repeat(DETAILS_MAX) });
    await t.run("feedback.continue");
    expect(t.copied).toEqual(["é".repeat(DETAILS_MAX)]);
    expect(t.toasts()).toContain("Details copied. Paste the rest into the issue.");
  });
  it("is in the ⋯ menu", async () => {
    const t = await started({ desktop: false });
    const more = (t.app.viewModels.select("vm.toolbar", t.app.store.state) as { more: { items: { id: string }[] }[] }).more.flatMap((g) => g.items.map((i) => i.id));
    expect(more).toContain("feedback.open");
  });
});
