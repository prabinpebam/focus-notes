/**
 * Review captures (D-146): the workflow that takes a catalogue's screenshots at every window size on
 * CI, the runner that keeps every size off the owner's screen locally (D-141), and the script that
 * downloads a branch's captures.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import yaml from "js-yaml";
import { artifactName, CATALOGS, catalog, outDir } from "../review/catalogs.mjs";
import { plan } from "../review/capture.mjs";
import { downloadArgs, labelFor, listArgs, pickRun, reviewRoot, WORKFLOW } from "../review/fetch-captures.mjs";

const root = join(import.meta.dirname, "..", "..");
const text = readFileSync(join(root, ".github", "workflows", WORKFLOW), "utf8");
const wf = yaml.load(text);
const job = wf.jobs.capture;

describe("the Review captures workflow", () => {
  it("SEC-05: pins every action by a full commit SHA, with its version as a comment", () => {
    const uses = [...text.matchAll(/^\s*(?:-\s+)?uses:\s*(\S+)(.*)$/gm)];
    expect(uses.length).toBeGreaterThanOrEqual(4);
    for (const [, ref, rest] of uses) {
      expect(ref, ref).toMatch(/^[\w.-]+\/[\w.-]+(\/[\w./-]+)?@[0-9a-f]{40}$/);
      expect(rest, ref).toMatch(/#\s*v\d+/);
    }
  });

  it("SEC-05: reads the repository and nothing more, and keeps no Git credentials", () => {
    expect(wf.permissions).toEqual({ contents: "read" });
    for (const j of Object.values(wf.jobs)) expect(j.permissions).toBeUndefined();
    for (const s of job.steps.filter((x) => x.uses?.startsWith("actions/checkout@"))) expect(s.with["persist-credentials"]).toBe(false);
  });

  it("runs by hand with a catalogue to choose, and on every push to a vq-* branch", () => {
    expect(wf.on.push.branches).toEqual(["vq-*"]);
    const inputs = wf.on.workflow_dispatch.inputs;
    expect(inputs.catalog.options.sort()).toEqual(Object.keys(CATALOGS).sort());
    expect(inputs.catalog.default).toBe("fre-catalog");
    expect(Object.keys(inputs).sort()).toEqual(["catalog", "grep", "only", "repeat"]);
  });

  it("D-141: takes every window size on a Windows runner, the only place it may resize a real window", () => {
    expect(job["runs-on"]).toBe("windows-latest");
    expect(job.env.FOCUS_NOTES_E2E_ALLOW_SCREEN).toBe("1");
    expect(job.env.FOCUS_NOTES_E2E).toBe("1");
    expect(job["timeout-minutes"]).toBeLessThanOrEqual(60);
  });

  it("passes its inputs through the environment, never into a script's text", () => {
    for (const s of job.steps.filter((x) => x.run)) expect(s.run, s.run).not.toMatch(/\$\{\{/);
    const capture = job.steps.find((s) => s.name === "Capture");
    expect(capture.run).toBe('node tools/review/capture.mjs "$env:CATALOG" --repeat "$env:REPEAT" --grep "$env:GREP" --only "$env:ONLY"');
    const build = job.steps.findIndex((s) => s.name === "Build the desktop app");
    expect(build).toBeGreaterThan(0);
    expect(job.steps.indexOf(capture)).toBeGreaterThan(build);
  });

  it("uploads the catalogue's folder (images, index and manifest) as review-<catalogue>, even after a failed journey", () => {
    const up = job.steps.find((s) => s.name === "Upload the captures");
    expect(up.uses).toMatch(/^actions\/upload-artifact@/);
    expect(up.if).toBe("${{ !cancelled() }}");
    expect(up.with.name).toBe("review-${{ env.CATALOG }}");
    expect(up.with.path).toBe("test-results/review/${{ env.CATALOG }}/");
    expect(up.with["if-no-files-found"]).toBe("error");
    expect(artifactName("fre-catalog")).toBe("review-fre-catalog");
    expect(outDir("fre-catalog").replace(/\\/g, "/")).toBe("test-results/review/fre-catalog");
  });
});

describe("the capture runner", () => {
  it("D-141: drops FOCUS_NOTES_E2E_ALLOW_SCREEN off CI, so a local capture takes the default window only", () => {
    const local = plan("fre-catalog", { env: { FOCUS_NOTES_E2E_ALLOW_SCREEN: "1", PATH: "x" } });
    expect(local.env.FOCUS_NOTES_E2E_ALLOW_SCREEN).toBeUndefined();
    expect(local.env.FOCUS_NOTES_E2E).toBe("1");
    expect(local.env.FOCUS_NOTES_CAPTURE_FRE).toBe("1");
    expect(local.env.FOCUS_NOTES_FRE_OUT.replace(/\\/g, "/")).toMatch(/test-results\/review\/fre-catalog$/);
    expect(local.sizes).toBe("the default window only");
    const ci = plan("fre-catalog", { env: { CI: "true", FOCUS_NOTES_E2E_ALLOW_SCREEN: "1" } });
    expect(ci.env.FOCUS_NOTES_E2E_ALLOW_SCREEN).toBe("1");
    expect(ci.sizes).toBe("every size");
  });

  it("runs the catalogue's spec, repeated and narrowed when asked, and refuses what it can't do", () => {
    expect(plan("fre-catalog", { env: {} }).args).toEqual(["test", "e2e/fre-catalog.spec.ts"]);
    const p = plan("vq-surfaces", { repeat: "10", grep: "small", only: "system menu", env: {} });
    expect(p.args).toEqual(["test", "e2e/vq-surfaces.spec.ts", "--repeat-each=10", "-g", "small"]);
    expect(p.env.VQ_ONLY).toBe("system menu");
    for (const repeat of ["0", "21", "1.5", "x"]) expect(() => plan("fre-catalog", { repeat, env: {} })).toThrow(/repeat/);
    expect(() => plan("fre-catalog", { only: "welcome", env: {} })).toThrow(/narrowed/);
    expect(() => plan("vq-surfaces", { grep: "a\nb", env: {} })).toThrow(/one line/);
    expect(() => catalog("nope")).toThrow(/No catalogue/);
  });
});

describe("fetch-captures", () => {
  it("downloads the branch's latest finished run's artifact into fre-review beside the repository", () => {
    expect(listArgs("vq-x")).toEqual(["run", "list", "--workflow", "review-captures.yml", "--branch", "vq-x", "--limit", "20", "--json", "databaseId,headSha,status,conclusion,createdAt"]);
    expect(downloadArgs(42, "fre-catalog", "D:\\r\\l")).toEqual(["run", "download", "42", "--name", "review-fre-catalog", "--dir", "D:\\r\\l"]);
    const runs = [
      { databaseId: 3, headSha: "c".repeat(40), status: "in_progress", conclusion: "" },
      { databaseId: 2, headSha: "b".repeat(40), status: "completed", conclusion: "cancelled" },
      { databaseId: 1, headSha: "a".repeat(40), status: "completed", conclusion: "failure" },
    ];
    expect(pickRun(runs).databaseId).toBe(1);
    expect(() => pickRun([])).toThrow(/gh workflow run review-captures.yml/);
    expect(labelFor("vq/fre polish", "0123456789abcdef")).toBe("vq-fre-polish-0123456");
    expect(reviewRoot({}, resolve("/", "side-projects", "focus-notes"))).toBe(resolve("/", "side-projects", "fre-review"));
    expect(reviewRoot({ FOCUS_NOTES_REVIEW_ROOT: "D:\\elsewhere" })).toBe("D:\\elsewhere");
  });
});
