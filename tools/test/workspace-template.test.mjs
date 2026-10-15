/**
 * The workspace template (WP-3.1, AGT-07, D-48, SEC-05): what `templates/workspace/` holds, that its
 * Deploy app workflow pins every action by full commit SHA, checks the bundle's SHA-256 and
 * attestation before anything in it runs, and lets private plaintext onto the runner only after
 * every downloaded step.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import yaml from "js-yaml";
import Ajv2020 from "ajv/dist/2020.js";

const root = join(import.meta.dirname, "..", "..");
const tpl = join(root, "templates", "workspace");
const read = (p) => readFileSync(join(tpl, p), "utf8");
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [relative(tpl, join(d, f)).split(sep).join("/")]));
const workflow = () => yaml.load(read(".github/workflows/pages.yml"));
const pin = () => JSON.parse(read(".focus-notes/app.json"));
const steps = () => workflow().jobs.build.steps;
const named = (re) => steps().findIndex((s) => re.test(s.name ?? ""));

describe("the workspace template's content", () => {
  it("holds exactly the instance's files: notes/, the format, the workflow, AGENTS.md, a README", () => {
    expect(walk(tpl).sort()).toEqual([
      ".focus-notes/app.json", ".focus-notes/managed.json", ".focus-notes/workspace.json", ".gitattributes",
      ".github/focus-notes/update.mjs", ".github/workflows/pages.yml", ".github/workflows/update.yml", "AGENTS.md", "README.md", "notes/.gitkeep",
    ]);
  });

  it("has no submodule yet: the setup adds private/ and .gitmodules (FRE-08)", () => {
    expect(existsSync(join(tpl, ".gitmodules"))).toBe(false);
    expect(existsSync(join(tpl, "private"))).toBe(false);
  });

  it("names the current workspace format, valid against its schema, and the pinned version", async () => {
    const { WORKSPACE_FORMAT } = await import("../../packages/core/src/workspace-format.ts");
    const format = JSON.parse(read(".focus-notes/workspace.json"));
    const schema = JSON.parse(readFileSync(join(root, "schemas", "workspace.schema.json"), "utf8"));
    expect(new Ajv2020({ strict: false }).validate(schema, format)).toBe(true);
    expect(format.formatVersion).toBe(WORKSPACE_FORMAT);
    expect(format.templateVersion).toBe(pin().version);
  });

  it("AGT-07: AGENTS.md covers the layout, front matter, links, private/ rules, and commit style", () => {
    const agents = read("AGENTS.md");
    for (const h of ["## Layout", "## A note", "## Links", "## `private/` rules", "## Commits"]) expect(agents).toContain(h);
    expect(agents).toMatch(/Front matter/);
    expect(agents).toMatch(/relative Markdown links/i);
    expect(agents).toMatch(/Never make the private repository public/);
    expect(agents).toMatch(/Pull `private\/` on its own/);
  });

  it("AGT-07: the product repository's AGENTS.md covers the same", () => {
    const agents = readFileSync(join(root, "AGENTS.md"), "utf8");
    const at = agents.indexOf("## Notes in this repository (AGT-07)");
    expect(at).toBeGreaterThan(0);
    const section = agents.slice(at, agents.indexOf("\n## ", at + 1));
    for (const w of ["**Layout.**", "**Front matter.**", "**Links.**", "**`private/` rules.**", "**Commit style.**"]) expect(section).toContain(w);
  });
});

// DST-02, the parts there now: the template a person copies is a whole instance that turns on
// GitHub Pages with GitHub Actions and deploys the released app, with nothing to build. Making the
// template repository itself from this folder, and a first deploy from it, wait for WP-5.6
// (Plan → Gate evidence → MW).
describe("DST-02: start in the browser from a copy of the template", () => {
  it("DST-02: a push to main deploys the released web app to the copy's own GitHub Pages with GitHub Actions", () => {
    const wf = workflow();
    expect(wf.on.push.branches).toEqual(["main"]);
    expect(wf.on).toHaveProperty("workflow_dispatch");
    expect(wf.jobs.deploy.permissions).toEqual({ pages: "write", "id-token": "write" });
    expect(wf.jobs.deploy.environment.name).toBe("github-pages");
    const uses = [...steps(), ...wf.jobs.deploy.steps].map((s) => (s.uses ?? "").split("@")[0]);
    for (const a of ["actions/configure-pages", "actions/upload-pages-artifact", "actions/deploy-pages"]) expect(uses).toContain(a);
    // No app to build: the workflow downloads the release's bundle and never installs or builds source.
    const runs = steps().map((s) => s.run ?? "").join("\n");
    expect(runs).not.toMatch(/pnpm (install|build)|npm (ci|install|run build)|vite build/);
    expect(wf.env.FOCUS_NOTES_SOURCE).toBe("prabinpebam/focus-notes");
  });

  it("DST-02: the README walks through it: Pages from GitHub Actions, open the site, write in the browser, the desktop app for GitHub", () => {
    const readme = read("README.md");
    expect(readme).toContain("**Settings → Pages → Source: GitHub Actions**");
    expect(readme).toContain("https://<your-username>.github.io/<this-repository>/");
    expect(readme).toContain("Notes written there stay in that browser.");
    expect(readme).toContain("desktop app from the [releases page](https://github.com/prabinpebam/focus-notes/releases/latest)");
  });

  it("DST-02: the app's \"make my own copy\" link is the template repository, not the source repository", async () => {
    const { TEMPLATE_URL } = await import("../../packages/core/src/browser.ts");
    const { TEMPLATE } = await import("../../apps/desktop/src/main/setup/engine.ts");
    expect(TEMPLATE_URL).toBe("https://github.com/prabinpebam/focus-notes-workspace");
    expect(`https://github.com/${TEMPLATE.owner}/${TEMPLATE.name}`).toBe(TEMPLATE_URL);
  });
});

describe("the template's Deploy app workflow (D-48, SEC-05)", () => {
  it("is valid YAML with the build and deploy jobs, and read-only contents by default", () => {
    const w = workflow();
    expect(w.name).toBe("Deploy app");
    expect(Object.keys(w.jobs)).toEqual(["build", "deploy", "after-deploy"]);
    expect(w.permissions).toEqual({ contents: "read" });
    expect(w.on.push.branches).toEqual(["main"]);
    expect(w.on).toHaveProperty("workflow_dispatch");
    expect(w.on.schedule).toHaveLength(1);
    expect(w.jobs.build.permissions).toEqual({ contents: "read", attestations: "read" });
    expect(w.jobs.deploy.permissions).toEqual({ pages: "write", "id-token": "write" });
    expect(w.jobs.deploy.needs).toBe("build");
    expect(w.jobs.deploy.if).toBe("github.event_name == 'schedule' || github.ref == format('refs/heads/{0}', github.event.repository.default_branch)");
  });

  it("pins every action by a full commit SHA, with its version as a comment", () => {
    const text = read(".github/workflows/pages.yml");
    const uses = [...text.matchAll(/^\s*(?:-\s+)?uses:\s*(\S+)(.*)$/gm)];
    expect(uses.length).toBeGreaterThanOrEqual(5);
    for (const [, ref, rest] of uses) {
      expect(ref, ref).toMatch(/^[\w.-]+\/[\w.-]+(\/[\w./-]+)?@[0-9a-f]{40}$/);
      expect(rest, ref).toMatch(/#\s*v\d+/);
    }
    // Every `uses` the YAML has is one the pattern saw (none hidden in a flow mapping).
    expect([...steps(), ...workflow().jobs.deploy.steps, ...workflow().jobs["after-deploy"].steps].filter((s) => s.uses)).toHaveLength(uses.length);
  });

  it("pins a version and a SHA-256 for the bundle in .focus-notes/app.json, a placeholder the deploy refuses until a release has one", () => {
    const { env } = workflow();
    expect(pin()).toEqual({ version: "0.0.0", sha256: "0".repeat(64) });
    expect(env).toEqual({ FOCUS_NOTES_SOURCE: "prabinpebam/focus-notes", FOCUS_NOTES_MIN_VERSION: "0.0.1" });
    // Read straight after the checkout and before anything is downloaded; the placeholder stops the run.
    expect(steps()[0].uses).toMatch(/^actions\/checkout@/);
    const step = steps()[1];
    expect(step.name).toMatch(/Read the pinned release/);
    expect(step.run).toContain("jq -er '.version | strings' .focus-notes/app.json");
    expect(step.run).toContain("jq -er '.sha256 | strings' .focus-notes/app.json");
    // Whole-string matches ([[ =~ ]]), so a value with a newline can't add lines to GITHUB_ENV.
    expect(step.run).toContain("re_version='^[0-9]+\\.[0-9]+\\.[0-9]+(-[0-9A-Za-z.-]+)?$'");
    expect(step.run).toContain("re_sha256='^[0-9a-f]{64}$'");
    expect(step.run).toMatch(/\[\[ \$version =~ \$re_version && \$sha256 =~ \$re_sha256 \]\]/);
    expect(step.run).toContain(`[ "$version" = "${pin().version}" ]`);
    expect(step.run.indexOf('>> "$GITHUB_ENV"')).toBeGreaterThan(step.run.lastIndexOf("exit 1"));
    expect(named(/Download the web app bundle/)).toBeGreaterThan(1);
  });

  it("checks the SHA-256 and the attestation before unpacking, and runs the bundle's publisher, never source", () => {
    const order = [/Download the web app bundle/, /SHA-256/, /attestation/, /Unpack/, /Publish the notes/].map(named);
    expect(order.every((i) => i > 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    const [, sha, attest, , publish] = order;
    expect(steps()[sha].run).toMatch(/sha256sum --check --strict/);
    expect(steps()[attest].run).toMatch(/gh attestation verify .* --repo "\$FOCUS_NOTES_SOURCE"/);
    expect(steps()[publish].run).toContain('node "$RUNNER_TEMP/bundle/publish/cli.mjs" publish');
    // The bundle's own page renderer renders the public pages (WP-5.5), at the site's address.
    expect(steps()[publish].run).toContain("--reader $RUNNER_TEMP/bundle/publish --site-url $SITE_URL/");
    expect(steps()[publish].env.SITE_URL).toBe("${{ steps.pages.outputs.base_url }}");
    expect(steps().find((s) => s.id === "pages").uses).toMatch(/^actions\/configure-pages@/);
    expect(steps()[publish].run).not.toMatch(/packages\/seal|pnpm|npm /);
    expect(steps()[publish].run).toMatch(/rm -rf private\s*$/);
  });

  it("checks out private/ only after every downloaded step, with the key removed by a trap and no persisted credentials", () => {
    const priv = named(/Check out the private repository/);
    expect(priv).toBe(named(/Unpack/) + 1);
    const step = steps()[priv];
    expect(step.if).toBe("env.HAS_PRIVATE_KEY == 'true' && (github.event_name == 'schedule' || github.ref == format('refs/heads/{0}', github.event.repository.default_branch))");
    expect(step.run).toMatch(/trap 'rm -f "\$key"' EXIT/);
    expect(step.run).toMatch(/StrictHostKeyChecking=yes/);
    expect(step.env.PRIVATE_CONTENT_KEY).toBe("${{ secrets.PRIVATE_CONTENT_KEY }}");
    // The secret's value reaches only this step.
    for (const [i, s] of steps().entries()) if (i !== priv) expect(JSON.stringify(s)).not.toContain("secrets.PRIVATE_CONTENT_KEY }}");
    const checkout = steps().find((s) => s.uses?.startsWith("actions/checkout@"));
    expect(checkout.with["persist-credentials"]).toBe(false);
  });
});
