/**
 * The release pipeline's workflows (DST-03, D-126, D-127): release.yml drafts a release from a tag
 * with installers, the web app bundle, the pinned workspace template, an SBOM, checksums and
 * attestations; preview-channel.yml replaces the rolling `preview` pre-release after each green
 * Windows CI on main. Both pin every action by SHA, keep each job's permissions to what it needs,
 * never expand an expression inside a script, and hold no secrets (PKG-04).
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";

const root = join(import.meta.dirname, "..", "..");
const load = (f) => { const text = readFileSync(join(root, ".github", "workflows", f), "utf8"); return { text, wf: yaml.load(text) }; };
const release = load("release.yml");
const preview = load("preview-channel.yml");
const ci = load("ci.yml");
const stepsOf = (job) => job.steps ?? [];
const allSteps = (wf) => Object.values(wf.jobs).flatMap(stepsOf);
const index = (job, re) => stepsOf(job).findIndex((s) => re.test(s.name ?? "") || re.test(s.uses ?? "") || re.test(s.run ?? ""));

describe.each([["release.yml", release], ["preview-channel.yml", preview]])("%s: the rules every publishing workflow follows", (_, { text, wf }) => {
  it("SEC-05: pins every action by a full commit SHA, with its version as a comment", () => {
    const uses = [...text.matchAll(/^\s*(?:-\s+)?uses:\s*(\S+)(.*)$/gm)];
    expect(uses.length).toBeGreaterThanOrEqual(6);
    for (const [, ref, rest] of uses) {
      expect(ref, ref).toMatch(/^[\w.-]+\/[\w.-]+(\/[\w./-]+)?@[0-9a-f]{40}$/);
      expect(rest, ref).toMatch(/#\s*v\d+/);
    }
    expect(allSteps(wf).filter((s) => s.uses)).toHaveLength(uses.length);
  });

  it("never expands ${{ }} inside a script: values reach scripts through env", () => {
    for (const s of allSteps(wf)) if (s.run) expect(s.run, s.name ?? s.run).not.toContain("${{");
  });

  it("runs no pull_request_target, reads only by default, and restores no cache", () => {
    expect(Object.keys(wf.on)).not.toContain("pull_request_target");
    expect(Object.keys(wf.on)).not.toContain("pull_request");
    expect(wf.permissions).toEqual({ contents: "read" });
    for (const s of allSteps(wf)) {
      if (s.uses?.startsWith("actions/setup-node@")) expect(s.with?.cache, "no cache in a publishing workflow").toBeUndefined();
      expect(s.uses ?? "").not.toMatch(/^actions\/cache/);
      if (s.uses?.startsWith("actions/checkout@")) expect(s.with["persist-credentials"]).toBe(false);
    }
  });

  it("PKG-04: holds no secrets; signing waits for DSK-07", () => {
    expect(text).not.toMatch(/secrets\./);
  });

  it("writes contents in exactly one job, and holds id-token only where it attests", () => {
    const jobs = Object.entries(wf.jobs);
    const writers = jobs.filter(([, j]) => j.permissions?.contents === "write").map(([n]) => n);
    expect(writers).toHaveLength(1);
    const writer = wf.jobs[writers[0]];
    expect(writer.permissions).toEqual({ contents: "write" });
    for (const [name, j] of jobs) {
      const attests = stepsOf(j).some((s) => s.uses?.startsWith("actions/attest-build-provenance@"));
      if (attests) expect(j.permissions, name).toEqual({ contents: "read", "id-token": "write", attestations: "write" });
      else expect(JSON.stringify(j.permissions ?? {}), name).not.toMatch(/id-token|attestations/);
      // The attesting job builds nothing: it only downloads, sums, attests and uploads.
      if (attests) for (const s of stepsOf(j)) expect(s.run ?? "").not.toMatch(/pnpm|npm|node /);
    }
  });

  it("writes SHA256SUMS before attesting every file it publishes", () => {
    const [name, job] = Object.entries(wf.jobs).find(([, j]) => stepsOf(j).some((s) => s.uses?.startsWith("actions/attest-build-provenance@")));
    expect(name).toBe("attest");
    const sums = index(job, /sha256sum -- \* > SHA256SUMS/);
    const attest = index(job, /^actions\/attest-build-provenance@/);
    expect(sums).toBeGreaterThan(0);
    expect(attest).toBe(sums + 1);
    expect(stepsOf(job)[attest].with["subject-path"]).toBe("dist/*");
  });
});

describe("release.yml (DST-03, D-126)", () => {
  const { wf } = release;
  const job = (n) => wf.jobs[n];

  it("DST-03: runs on a v<version> tag, or by hand as a dry run (the default)", () => {
    expect(wf.on.push).toEqual({ tags: ["v[0-9]*"] });
    expect(wf.on.workflow_dispatch.inputs["dry-run"]).toMatchObject({ type: "boolean", default: true });
    expect(Object.keys(wf.jobs)).toEqual(["version", "desktop", "web", "attest", "release"]);
    expect(stepsOf(job("version")).find((s) => s.id === "v").run).toBe("node tools/release/version.mjs");
    expect(stepsOf(job("version")).find((s) => s.id === "v").env.DRY_RUN_INPUT).toBe("${{ inputs.dry-run }}");
  });

  it("DST-03: builds the installers on Windows, macOS and Linux; only Windows blocks (D-112)", () => {
    const d = job("desktop");
    expect(d.strategy.matrix.os).toEqual(["windows-latest", "macos-latest", "ubuntu-latest"]);
    expect(d.strategy["fail-fast"]).toBe(false);
    expect(d["continue-on-error"]).toBe("${{ matrix.os != 'windows-latest' }}");
    expect(d.env.VERSION).toBe("${{ needs.version.outputs.version }}");
    expect(d.env.CSC_IDENTITY_AUTO_DISCOVERY).toBe("false");
    const build = stepsOf(d).find((s) => /Build the installers/.test(s.name ?? ""));
    expect(build.run).toBe('pnpm --filter @focus-notes/desktop run dist "-c.extraMetadata.version=$VERSION"');
  });

  it("DST-03, SEC-01: smoke-tests the Windows build: its fuses, then the packaged app starts and shows a note", () => {
    const d = job("desktop");
    const fuses = index(d, /fuses/), smoke = index(d, /Packaged app smoke test/), upload = index(d, /^actions\/upload-artifact@/);
    expect(fuses).toBeGreaterThan(index(d, /Build the installers/));
    expect(smoke).toBe(fuses + 1);
    expect(upload).toBe(smoke + 1);
    expect(stepsOf(d)[fuses]).toMatchObject({ if: "runner.os == 'Windows'", run: "pnpm exec vitest run apps/desktop/test/hardening.test.ts" });
    expect(stepsOf(d)[smoke]).toMatchObject({ if: "runner.os == 'Windows'", run: "pnpm exec playwright test e2e/packaged.spec.ts" });
    expect(stepsOf(d)[smoke].env.FOCUS_NOTES_E2E_EXE).toMatch(/win-unpacked\\focus-notes\.exe$/);
    // Installers only: never the unpacked folder, where the smoke test leaves its test copy (D-116).
    const paths = stepsOf(d)[upload].with.path.trim().split("\n").map((p) => p.trim());
    expect(paths.filter((p) => !p.startsWith("!")).every((p) => /^apps\/desktop\/release\/\*\.\w+$/.test(p))).toBe(true);
    expect(paths).toContain("!apps/desktop/release/__uninstaller*");
  });

  it("DST-03, D-98: packs the web app bundle, smoke-tests its publisher, pins the template to it, and writes the SBOM", () => {
    const w = job("web");
    const order = [/run build$/m, /run build:publish/, /web-bundle\.mjs pack/, /web-bundle\.mjs smoke/, /template\.mjs/, /sbom\.mjs/, /^actions\/upload-artifact@/].map((re) => index(w, re));
    expect(order.every((i) => i > 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(stepsOf(w).at(-1).with.name).toBe("asset-web");
  });

  it("DST-03: attests only after Windows and the bundle are built, from every asset-* artifact", () => {
    const a = job("attest");
    expect(a.needs).toEqual(["version", "desktop", "web"]);
    expect(stepsOf(a)[0].with).toMatchObject({ pattern: "asset-*", path: "dist", "merge-multiple": true });
  });

  it("DST-03: drafts the release only on a real tag, in the protected release environment, with the notes", () => {
    const r = job("release");
    expect(r.needs).toEqual(["version", "attest"]);
    expect(r.if).toBe("needs.version.outputs.dry-run == 'false'");
    expect(r.environment).toBe("release");
    const run = stepsOf(r).at(-1).run;
    expect(run).toMatch(/flags=\(--draft --verify-tag\)/);
    expect(run).toMatch(/--prerelease/);
    expect(run).toMatch(/gh release create "\$TAG" dist\/\* .*--notes-file notes\/release-notes\.md/);
    expect(stepsOf(job("version")).some((s) => /notes\.mjs --tag "\$TAG" --ref "\$GITHUB_SHA"/.test(s.run ?? ""))).toBe(true);
    expect(stepsOf(job("version"))[0].with["fetch-depth"]).toBe(0);
  });

  it("supersedes preview-release.yml: stage exits are draft pre-releases from the same pipeline", () => {
    expect(existsSync(join(root, ".github", "workflows", "preview-release.yml"))).toBe(false);
  });
});

describe("preview-channel.yml (D-122 phase 3, D-127)", () => {
  const { wf } = preview;
  const job = (n) => wf.jobs[n];

  it("runs only when ci completes on main, never on its own trigger", () => {
    expect(wf.on).toEqual({ workflow_run: { workflows: [ci.wf.name], types: ["completed"], branches: ["main"] } });
    expect(wf.concurrency).toEqual({ group: "preview-channel", "cancel-in-progress": false });
    expect(Object.keys(wf.jobs)).toEqual(["gate", "build", "attest", "publish"]);
  });

  it("publishes only a green push to this repository's own main, after reading every Windows job", () => {
    const g = job("gate");
    for (const c of ["github.event.workflow_run.conclusion == 'success'", "github.event.workflow_run.event == 'push'", "github.event.workflow_run.head_branch == 'main'", "github.event.workflow_run.head_repository.full_name == github.repository"]) expect(g.if).toContain(c);
    expect(g.permissions).toEqual({ actions: "read" });
    const run = stepsOf(g)[0].run;
    expect(run).toMatch(/actions\/runs\/\$RUN_ID\/jobs/);
    expect(run).toMatch(/test\("windows"; "i"\)/);
    expect(run).toMatch(/-lt 5/);
    expect(run).toMatch(/\$2 != "success"/);
    expect(job("build").needs).toBe("gate");
    expect(job("attest").needs).toBe("build");
    expect(job("publish").needs).toEqual(["build", "attest"]);
  });

  it("ci names its Windows jobs so the gate finds them: the Windows test job and four journey shards", () => {
    expect(ci.wf.jobs.test.strategy.matrix.os).toContain("windows-latest");
    expect(ci.wf.jobs["journeys-windows"].strategy.matrix.shard).toHaveLength(4);
    expect(ci.wf.jobs["journeys-windows"]["runs-on"]).toBe("windows-latest");
  });

  it("builds exactly the commit ci tested, on Windows, read-only, and zips the app before the smoke test", () => {
    const b = job("build");
    expect(b["runs-on"]).toBe("windows-latest");
    expect(b.permissions).toBeUndefined();
    expect(stepsOf(b)[0].with.ref).toBe("${{ github.event.workflow_run.head_sha }}");
    const zip = index(b, /Zip the unpacked app/), smoke = index(b, /Packaged app smoke test/), fuses = index(b, /fuses/);
    expect(index(b, /Build the installer/)).toBeLessThan(zip);
    expect(zip).toBeLessThan(fuses);
    expect(fuses).toBeLessThan(smoke);
    expect(stepsOf(b)[zip].run).toMatch(/Compress-Archive -Path apps\/desktop\/release\/win-unpacked\/\*/);
    expect(stepsOf(b)[zip].run).toMatch(/-Exclude __uninstaller\*/);
    expect(stepsOf(b)[zip].run).toMatch(/commit\.txt \$env:HEAD_SHA/);
  });

  it("replaces the `preview` pre-release at that commit, and never with an older commit than the one there", () => {
    const run = stepsOf(job("publish")).at(-1).run;
    expect(run).toMatch(/git\/ref\/tags\/preview/);
    expect(run).toMatch(/compare\/\$current\.\.\.\$HEAD_SHA/);
    expect(run).toMatch(/"\$status" != "ahead"/);
    expect(run.indexOf("gh release delete preview")).toBeLessThan(run.indexOf("gh release create preview"));
    expect(run).toMatch(/gh release create preview dist\/\* --repo "\$GITHUB_REPOSITORY" --target "\$HEAD_SHA" --prerelease/);
    expect(run).toMatch(/--title "Preview \$VERSION \(\$short\)"/);
  });
});
