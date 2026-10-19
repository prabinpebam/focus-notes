/**
 * Send feedback in the main process (QLT-07, D-203), against the in-memory GitHub: the window's
 * input checked strictly, the issue always opened on the project's fixed repository, the token and
 * the report kept out of what goes back, GitHub's answers mapped to problem codes, one send at a
 * time, and Continue on GitHub's address without the report.
 */
import { describe, expect, it } from "vitest";
import { GitHubApi } from "@focus-notes/github";
import { FEEDBACK_ISSUES, FEEDBACK_NEW_ISSUE, FEEDBACK_COOLDOWN_MS, FEEDBACK_FAILED_WAIT_MS, FEEDBACK_HOURLY_MAX, FEEDBACK_MARKER, TITLE_MAX } from "@focus-notes/core/feedback";
import { FakeGitHub } from "../../../packages/github/test/fake-github.ts";
import { feedbackMain } from "../src/main/feedback.ts";

const REPORT = "# Focus Notes diagnostic report\n\nGit: 2.47 · signed in as [account]\nWorkspace: [workspace]";
const ok = { kind: "problem", title: "Crash on save", details: "It closed when I saved.", attachReport: true };
/** Without the report, which needs a preview first. */
const plain = { ...ok, attachReport: false };

function world(o: { signedIn?: boolean } = {}) {
  const gh = new FakeGitHub();
  const copied: string[] = [];
  const opened: string[] = [];
  const reports: unknown[] = [];
  let t = 0;
  const main = feedbackMain({
    client: async () => (o.signedIn === false ? undefined : new GitHubApi(gh.token, gh.fetch)),
    // Each build differs, as a real one does (its time): the first is REPORT.
    report: async (timings, use) => (reports.push([timings, use]), reports.length === 1 ? REPORT : `${REPORT} (${reports.length})`),
    system: { version: "0.5.0", platform: "win32", release: "10.0.26100", arch: "x64" },
    copy: (text) => void copied.push(text),
    open: async (url) => void opened.push(url),
    now: () => t,
  });
  return { gh, main, copied, opened, reports, advance: (ms: number) => void (t += ms) };
}

describe("feedback:send", () => {
  it("opens an issue on prabinpebam/focus-notes with the title, the body and the labels, and returns only its number and address", async () => {
    const w = world();
    expect(await w.main.preview([{ name: "focus-notes:save", count: 1 }])).toBe(REPORT);
    const r = await w.main.send({ ...ok, title: "  Crash on save " });
    expect(r).toEqual({ number: 101, url: `${FEEDBACK_ISSUES}101` });
    expect(Object.keys(r).sort()).toEqual(["number", "url"]);
    expect(w.gh.issues).toHaveLength(1);
    const issue = w.gh.issues[0]!;
    expect(issue).toMatchObject({ owner: "prabinpebam", repo: "focus-notes", title: "Crash on save", labels: ["bug", "from-app"] });
    expect(issue.body.startsWith("It closed when I saved.\n\n---\n\nFocus Notes 0.5.0 · Windows 10.0.26100 (x64)\n\n<details><summary>Diagnostic report</summary>")).toBe(true);
    expect(FEEDBACK_MARKER.exec(issue.body)?.[1]).toBe("problem");
    // Built once, for the preview, as a report that's being sent; the issue holds that same text.
    expect(w.reports).toEqual([[[{ name: "focus-notes:save", count: 1 }], { forSend: true }]]);
    expect(issue.body).toContain(`\n\n${REPORT}\n\n</details>`);
    // The token went only in the Authorization header, to the API.
    expect(issue.body).not.toContain(w.gh.token);
    expect(JSON.stringify(r)).not.toContain(w.gh.token);
    expect(w.gh.raw.every((x) => x.url.startsWith("https://api.github.com/"))).toBe(true);
  });
  it("leaves the report out unless attached, and asks for an idea's labels", async () => {
    const w = world();
    await w.main.send({ ...ok, kind: "idea", attachReport: false });
    const issue = w.gh.issues[0]!;
    expect(issue.labels).toEqual(["enhancement", "from-app"]);
    expect(issue.body).not.toContain("Diagnostic report");
    expect(w.reports).toEqual([]);
  });
  it("can't be pointed at another repository from the window", async () => {
    const w = world();
    for (const extra of [{ owner: "evil" }, { repo: "evil/notes" }, { name: "notes" }, { url: "https://api.github.com/repos/evil/notes/issues" }]) {
      expect(await w.main.send({ ...plain, ...extra })).toEqual({ problem: "invalid" });
    }
    expect(w.gh.calls).toEqual([]);
    await w.main.send(plain);
    expect(w.gh.calls.map((c) => `${c.method} ${c.path}`)).toEqual(["POST /repos/prabinpebam/focus-notes/issues"]);
  });
  it("refuses wrong types and oversized input before asking GitHub", async () => {
    const w = world();
    for (const bad of [undefined, null, "Crash", [ok], { ...ok, kind: "bug" }, { ...ok, title: "" }, { ...ok, title: 1 }, { ...ok, attachReport: 1 }, { ...ok, title: "a".repeat(TITLE_MAX + 1) }, { ...ok, details: "a".repeat(5001) }]) {
      expect(await w.main.send(bad)).toEqual({ problem: "invalid" });
    }
    expect(w.gh.calls).toEqual([]);
  });
  it("signed out, there's nothing to post with", async () => {
    const w = world({ signedIn: false });
    expect(await w.main.send(plain)).toEqual({ problem: "signedOut" });
  });
  it("maps GitHub's answers to problem codes", async () => {
    const cases: [number, string][] = [[401, "expired"], [403, "refused"], [404, "refused"], [410, "refused"], [422, "refused"], [429, "refused"], [500, "network"], [502, "network"], [503, "network"]];
    for (const [status, problem] of cases) {
      const w = world();
      w.gh.fail("POST /repos/prabinpebam/focus-notes/issues", status);
      expect(await w.main.send(plain), String(status)).toEqual({ problem });
    }
    const off = world();
    off.gh.offline = true;
    expect(await off.main.send(plain)).toEqual({ problem: "network" });
  });
  it("sends one at a time, then waits 30 seconds after a success", async () => {
    const w = world();
    const [a, b] = await Promise.all([w.main.send(plain), w.main.send(plain)]);
    expect(a).toMatchObject({ number: 101 });
    expect(b).toEqual({ problem: "busy" });
    expect(await w.main.send(plain)).toEqual({ problem: "busy" });
    w.advance(FEEDBACK_COOLDOWN_MS);
    expect(await w.main.send(plain)).toMatchObject({ number: 102 });
  });
  it("after a failure, Try again waits 5 seconds", async () => {
    const w = world();
    await w.main.preview([]);
    w.gh.fail("POST /repos/prabinpebam/focus-notes/issues", 502);
    expect(await w.main.send(ok)).toEqual({ problem: "network" });
    expect(await w.main.send(ok)).toEqual({ problem: "wait" });
    w.advance(FEEDBACK_FAILED_WAIT_MS - 1);
    expect(await w.main.send(ok)).toEqual({ problem: "wait" });
    w.advance(1);
    expect(await w.main.send(ok)).toMatchObject({ number: 101 });
  });
  it("opens at most 5 issues an hour from one run", async () => {
    const w = world();
    const idea = { ...ok, kind: "idea", attachReport: false };
    for (let i = 0; i < FEEDBACK_HOURLY_MAX; i++) {
      expect(await w.main.send(idea)).toMatchObject({ number: 101 + i });
      w.advance(FEEDBACK_COOLDOWN_MS);
    }
    expect(await w.main.send(idea)).toEqual({ problem: "limit" });
    expect(w.gh.issues).toHaveLength(FEEDBACK_HOURLY_MAX);
    // An hour after the first, one more may go.
    w.advance(3_600_000 - FEEDBACK_HOURLY_MAX * FEEDBACK_COOLDOWN_MS);
    expect(await w.main.send(idea)).toMatchObject({ number: 106 });
  });
  it("posts exactly the report last previewed, and nothing attached without one", async () => {
    const w = world();
    expect(await w.main.send(ok)).toEqual({ problem: "invalid" });
    expect(w.gh.calls).toEqual([]);
    // Two previews under way: the later one is what's shown, and what's posted, whichever answers first.
    const [first, second] = await Promise.all([w.main.preview([]), w.main.preview([])]);
    expect(first).toBe(REPORT);
    expect(await w.main.send(ok)).toMatchObject({ number: 101 });
    expect(w.gh.issues[0]!.body).toContain(`\n\n${second}\n\n</details>`);
    expect(w.gh.issues[0]!.body).not.toContain(`\n\n${REPORT}\n\n`);
    // Used once: another send needs a fresh preview.
    w.advance(FEEDBACK_COOLDOWN_MS);
    expect(await w.main.send(ok)).toEqual({ problem: "invalid" });
  });
  it("passes on an issue's address only when it's the project's", async () => {
    const main = feedbackMain({
      client: async () => ({ createIssue: async () => ({ number: 5, url: "https://evil.example/issues/5" }) }),
      report: async () => REPORT,
      system: { version: "0.5.0", platform: "win32" },
      copy: () => {},
      open: async () => {},
    });
    await main.preview([]);
    expect(await main.send(ok)).toEqual({ number: 5, url: "" });
  });
});

describe("feedback:continue", () => {
  it("opens the new-issue form without the report, and copies the report when attached", async () => {
    const w = world();
    await w.main.preview([]);
    expect(await w.main.continue(ok)).toBe("report");
    expect(w.opened).toHaveLength(1);
    const url = new URL(w.opened[0]!);
    expect(`${url.origin}${url.pathname}`).toBe(FEEDBACK_NEW_ISSUE);
    expect(w.opened[0]).not.toContain("Diagnostic");
    expect(decodeURIComponent(w.opened[0]!)).not.toContain("[workspace]");
    expect(url.searchParams.get("labels")).toBe("bug,from-app");
    expect(w.copied).toEqual([`<details><summary>Diagnostic report</summary>\n\n${REPORT}\n\n</details>`]);
    expect(w.gh.calls).toEqual([]);
  });
  it("copies nothing for an idea that fits, and the details when they don't", async () => {
    const w = world();
    expect(await w.main.continue({ ...ok, kind: "idea", attachReport: false })).toBe("none");
    expect(w.copied).toEqual([]);
    const long = "é".repeat(5000);
    expect(await w.main.continue({ ...ok, details: long, attachReport: false })).toBe("details");
    expect(w.copied).toEqual([long]);
    await w.main.preview([]);
    expect(await w.main.continue({ ...ok, details: long })).toBe("both");
    expect(w.copied.at(-1)!.startsWith(long)).toBe(true);
    expect(w.copied.at(-1)).toContain("Diagnostic report");
  });
  it("opens nothing for input it refuses", async () => {
    const w = world();
    expect(await w.main.continue({ ...ok, url: "https://evil.example" })).toBe("none");
    expect(w.opened).toEqual([]);
  });
});
