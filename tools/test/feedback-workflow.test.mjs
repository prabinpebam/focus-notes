/**
 * The Feedback labels workflow (`.github/workflows/feedback-labels.yml`, QLT-07, D-203): it runs on
 * new issues, may only write issues, pins its one action by full commit SHA (SEC-05), never puts the
 * issue's text in a shell or an expression, and looks for the same marker the app writes.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import { feedbackMarker, FEEDBACK_MARKER } from "../../packages/core/src/feedback.ts";

const root = join(import.meta.dirname, "..", "..");
const text = readFileSync(join(root, ".github/workflows/feedback-labels.yml"), "utf8");
const wf = yaml.load(text);
const steps = wf.jobs.label.steps;

describe("the Feedback labels workflow", () => {
  it("runs when an issue is opened, with permission to write issues and nothing else", () => {
    expect(wf.on).toEqual({ issues: { types: ["opened"] } });
    expect(wf.permissions).toEqual({ issues: "write" });
    expect(Object.values(wf.jobs).every((j) => j.permissions === undefined)).toBe(true);
  });

  it("SEC-05: pins its action by a full commit SHA, with its version as a comment", () => {
    const uses = [...text.matchAll(/^\s*(?:-\s+)?uses:\s*(\S+)(.*)$/gm)];
    expect(uses).toHaveLength(1);
    expect(uses[0][1]).toMatch(/^actions\/github-script@[0-9a-f]{40}$/);
    expect(uses[0][2]).toMatch(/#\s*v\d+/);
  });

  it("never puts the issue's text in a shell or an expression", () => {
    expect(steps.some((s) => s.run)).toBe(false);
    expect(text).not.toMatch(/\$\{\{/);
    expect(steps[0].with.script).toContain("context.payload.issue.body");
  });

  it("matches the marker the app writes, for both kinds", () => {
    const script = steps[0].with.script;
    const re = new RegExp(/\/(<!-- focus-notes-feedback: [^/]+)\//.exec(script)[1]);
    expect(re.source).toBe(FEEDBACK_MARKER.source);
    for (const kind of ["problem", "idea"]) expect(re.exec(feedbackMarker(kind, { version: "0.5.0", platform: "win32" }))?.[1]).toBe(kind);
    expect(script).toContain('"bug"');
    expect(script).toContain('"enhancement"');
    expect(script).toContain('"from-app"');
  });
});
