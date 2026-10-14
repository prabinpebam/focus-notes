/**
 * Both Deploy app workflows, the project's (`.github/workflows/pages.yml`, built from source) and the
 * template's (`templates/workspace/.github/workflows/pages.yml`, the released bundle): every action
 * pinned by full commit SHA (SEC-05), a nightly deploy so share links expire without a push and the
 * 50-day warning before GitHub turns scheduled runs off (SHR-11), and private plaintext on the runner
 * only after every third-party step, deleted straight after publishing (WP-5.2).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";

const root = join(import.meta.dirname, "..", "..");
const files = { project: ".github/workflows/pages.yml", template: "templates/workspace/.github/workflows/pages.yml" };

describe.each(Object.entries(files))("the %s's Deploy app workflow", (_, file) => {
  const text = readFileSync(join(root, file), "utf8");
  const wf = yaml.load(text);
  const steps = wf.jobs.build.steps;
  const named = (re) => steps.findIndex((s) => re.test(s.name ?? ""));

  it("SEC-05: pins every action by a full commit SHA, with its version as a comment", () => {
    const uses = [...text.matchAll(/^\s*(?:-\s+)?uses:\s*(\S+)(.*)$/gm)];
    expect(uses.length).toBeGreaterThanOrEqual(4);
    for (const [, ref, rest] of uses) {
      expect(ref, ref).toMatch(/^[\w.-]+\/[\w.-]+(\/[\w./-]+)?@[0-9a-f]{40}$/);
      expect(rest, ref).toMatch(/#\s*v\d+/);
    }
    expect([...steps, ...wf.jobs.deploy.steps].filter((s) => s.uses)).toHaveLength(uses.length);
  });

  it("SEC-05: can't push anything: contents are read-only everywhere, so updates arrive only as pull requests", () => {
    expect(wf.permissions).toEqual({ contents: "read" });
    for (const job of Object.values(wf.jobs)) expect(job.permissions?.contents ?? "read").toBe("read");
  });

  it("SHR-11: deploys nightly, so expiry takes effect without a push, and only main deploys", () => {
    expect(wf.on.push.branches).toEqual(["main"]);
    expect(wf.on).toHaveProperty("workflow_dispatch");
    expect(wf.on.schedule).toHaveLength(1);
    expect(wf.on.schedule[0].cron).toMatch(/^\d+ \d+ \* \* \*$/);
    expect(wf.jobs.deploy.if).toBe("github.ref == 'refs/heads/main'");
  });

  it("SHR-11: a nightly run fails on purpose when the last commit is 50 days old, before GitHub's 60-day shutoff", () => {
    const i = named(/still active/);
    expect(i).toBeGreaterThan(0);
    expect(steps[i].if).toBe("github.event_name == 'schedule'");
    expect(steps[i].run).toMatch(/git log -1 --format=%ct/);
    expect(steps[i].run).toMatch(/-ge 50/);
    expect(steps[i].run).toMatch(/::error::/);
    expect(steps[i].run).toMatch(/exit 1/);
    // It runs before anything is built or downloaded.
    expect(i).toBeLessThan(steps.findIndex((s) => /setup-node/.test(s.uses ?? "")));
  });

  it("checks out private/ only after every third-party step, and deletes it straight after publishing", () => {
    const priv = named(/Check out the private repository/);
    const pub = named(/^Publish/);
    expect(priv).toBeGreaterThan(0);
    expect(pub).toBe(priv + 1);
    expect(steps[pub].run).toMatch(/rm -rf private\s*$/);
    // Before the checkout: every action except the upload, which runs once private/ is gone.
    const after = steps.slice(priv).filter((s) => s.uses).map((s) => s.uses.split("@")[0]);
    expect(after).toEqual(["actions/upload-pages-artifact"]);
    expect(steps[priv].run).toMatch(/trap 'rm -f "\$key"' EXIT/);
    for (const [i, s] of steps.entries()) if (i !== priv) expect(JSON.stringify(s)).not.toContain("secrets.PRIVATE_CONTENT_KEY }}");
    for (const s of steps.filter((x) => x.uses?.startsWith("actions/checkout@"))) expect(s.with["persist-credentials"]).toBe(false);
  });
});
