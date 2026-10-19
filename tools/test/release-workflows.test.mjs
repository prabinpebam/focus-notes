/**
 * The release pipeline's workflows (DST-03, D-128, D-129): release.yml drafts a release from a tag
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
      // setup-node turns its package-manager cache on by itself when package.json names a
      // packageManager, so it's switched off explicitly (L9); pnpm/action-setup's stays off.
      if (s.uses?.startsWith("actions/setup-node@")) {
        expect(s.with?.cache, "no cache in a publishing workflow").toBeUndefined();
        expect(s.with?.["package-manager-cache"]).toBe(false);
      }
      if (s.uses?.startsWith("pnpm/action-setup@")) expect(s.with?.cache ?? false).toBe(false);
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

  it("attests every file it publishes, SHA256SUMS included, in a job named attest", () => {
    const [name, job] = Object.entries(wf.jobs).find(([, j]) => stepsOf(j).some((s) => s.uses?.startsWith("actions/attest-build-provenance@")));
    expect(name).toBe("attest");
    const attest = index(job, /^actions\/attest-build-provenance@/);
    expect(stepsOf(job)[attest].with["subject-path"]).toBe("dist/*");
    // Never more than one copy of the attesting action.
    expect(allSteps(wf).filter((s) => s.uses?.startsWith("actions/attest-build-provenance@"))).toHaveLength(1);
  });
});

describe("M2: verification names the signing workflow and the ref, not just the repository", () => {
  it("the release notes and the docs give the release's workflow and tag", async () => {
    const { releaseNotes } = await import("../release/notes.mjs");
    expect(releaseNotes({ tag: "v1.2.3", previous: null, commits: [] })).toContain(
      "gh attestation verify <file> --repo prabinpebam/focus-notes --signer-workflow prabinpebam/focus-notes/.github/workflows/release.yml --source-ref refs/tags/v1.2.3");
    const dist = readFileSync(join(root, "documentations", "plan", "distribution.md"), "utf8");
    expect(dist).toContain("--signer-workflow prabinpebam/focus-notes/.github/workflows/release.yml --source-ref refs/tags/v");
    expect(dist).toContain("--signer-workflow prabinpebam/focus-notes/.github/workflows/preview-channel.yml --source-ref refs/heads/main");
  });

  it("the preview's notes give preview-channel.yml and main", () => {
    const run = stepsOf(preview.wf.jobs.publish).at(-1).run;
    expect(run).toContain("--signer-workflow $GITHUB_REPOSITORY/.github/workflows/preview-channel.yml --source-ref refs/heads/main");
  });

  it("the template's Deploy app workflow checks the bundle came from release.yml at its tag, on a hosted runner (D-137)", () => {
    const tpl = yaml.load(readFileSync(join(root, "templates", "workspace", ".github", "workflows", "pages.yml"), "utf8"));
    const step = tpl.jobs.build.steps.find((s) => /attestation/.test(s.name ?? ""));
    expect(step.run).toBe('gh attestation verify "$RUNNER_TEMP/bundle.tgz" --repo "$FOCUS_NOTES_SOURCE" --cert-identity "https://github.com/$FOCUS_NOTES_SOURCE/.github/workflows/release.yml@refs/tags/v$FOCUS_NOTES_VERSION" --source-ref "refs/tags/v$FOCUS_NOTES_VERSION" --deny-self-hosted-runners');
  });
});

describe("release.yml (DST-03, D-128)", () => {
  const { wf } = release;
  const job = (n) => wf.jobs[n];

  it("DST-03: runs on a v<version> tag, or by hand as a dry run (the default)", () => {
    expect(wf.on.push).toEqual({ tags: ["v[0-9]*"] });
    expect(wf.on.workflow_dispatch.inputs["dry-run"]).toMatchObject({ type: "boolean", default: true });
    expect(Object.keys(wf.jobs)).toEqual(["version", "desktop", "web", "store", "collect", "attest", "release"]);
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

  it("DST-03, L8: collects every asset-* artifact into its own folder, fails on a duplicate name, then writes SHA256SUMS", () => {
    const c = job("collect");
    expect(c.needs).toEqual(["version", "desktop", "web", "store"]);
    expect(c.permissions).toBeUndefined();
    expect(stepsOf(c)[0].with).toEqual({ pattern: "asset-*", path: "parts" });
    const run = stepsOf(c)[1].run;
    expect(run).toMatch(/uniq -d/);
    expect(run.indexOf("uniq -d")).toBeLessThan(run.indexOf("exit 1"));
    expect(run.indexOf("exit 1")).toBeLessThan(run.indexOf("sha256sum -- * > SHA256SUMS"));
    expect(stepsOf(c).at(-1).with.name).toBe("release-assets");
  });

  it("M2: attests only a real release, never a dry run, and the attesting job only downloads and attests", () => {
    const a = job("attest");
    expect(a.if).toBe("needs.version.outputs.dry-run == 'false'");
    expect(a.needs).toEqual(["version", "collect"]);
    expect(stepsOf(a).map((s) => (s.uses ?? "").split("@")[0])).toEqual(["actions/download-artifact", "actions/attest-build-provenance"]);
    expect(stepsOf(a)[0].with).toEqual({ name: "release-assets", path: "dist" });
  });

  it("DST-03: drafts the release only on a real tag, in the release environment, with the notes", () => {
    const r = job("release");
    expect(r.needs).toEqual(["version", "collect", "attest"]);
    expect(r.if).toBe("needs.version.outputs.dry-run == 'false'");
    // The environment's reviewers and tag policy are repository settings the owner sets (M1, D-128).
    expect(r.environment).toBe("release");
    const run = stepsOf(r).at(-1).run;
    expect(run).toMatch(/flags=\(--draft --verify-tag\)/);
    expect(run).toMatch(/--prerelease/);
    expect(run).toMatch(/gh release create "\$TAG" dist\/\* .*--notes-file notes\/release-notes\.md/);
    expect(stepsOf(job("version")).some((s) => /notes\.mjs --tag "\$TAG" --ref "\$GITHUB_SHA"/.test(s.run ?? ""))).toBe(true);
    expect(stepsOf(job("version"))[0].with["fetch-depth"]).toBe(0);
  });

  it("L6: refuses to draft when the tag (peeled) no longer names the commit that was built", () => {
    const run = stepsOf(job("release")).at(-1).run;
    expect(run).toMatch(/gh api "repos\/\$GITHUB_REPOSITORY\/commits\/refs\/tags\/\$TAG" --jq \.sha/);
    expect(run).toMatch(/"\$tagged" != "\$GITHUB_SHA"/);
    expect(run.indexOf("$GITHUB_SHA")).toBeLessThan(run.indexOf("gh release create"));
  });

  it("supersedes preview-release.yml: stage exits are draft pre-releases from the same pipeline", () => {
    expect(existsSync(join(root, ".github", "workflows", "preview-release.yml"))).toBe(false);
    expect(Object.keys(wf.jobs)).toEqual(["version", "desktop", "web", "store", "collect", "attest", "release"]);
    expect(release.text).not.toMatch(/protected/);
  });
});

describe("preview-channel.yml (D-122 phase 3, D-129)", () => {
  const { wf } = preview;
  const job = (n) => wf.jobs[n];

  it("runs only when ci completes on main, never on its own trigger; L4: build and publish queue per job", () => {
    expect(wf.on).toEqual({ workflow_run: { workflows: [ci.wf.name], types: ["completed"], branches: ["main"] } });
    expect(wf.concurrency).toBeUndefined();
    expect(job("build").concurrency).toEqual({ group: "preview-channel-build", "cancel-in-progress": false });
    expect(job("publish").concurrency).toEqual({ group: "preview-channel-publish", "cancel-in-progress": false });
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

  it("M3: builds only when main's tip is the commit ci tested, so the attestation names the commit it built", () => {
    const g = job("gate");
    const step = stepsOf(g).find((s) => s.id === "tip");
    expect(step.env.HEAD_SHA).toBe("${{ github.event.workflow_run.head_sha }}");
    expect(step.run).toMatch(/"\$HEAD_SHA" = "\$GITHUB_SHA"/);
    expect(step.run).toMatch(/current=true/);
    expect(step.run).toMatch(/current=false/);
    expect(g.outputs.current).toBe("${{ steps.tip.outputs.current }}");
    expect(job("build").if).toBe("needs.gate.outputs.current == 'true'");
    // And the build itself refuses a mismatch, whatever the gate said.
    expect(stepsOf(job("build"))[0].run).toMatch(/"\$HEAD_SHA" != "\$GITHUB_SHA"/);
    expect(stepsOf(job("build"))[0].run).toMatch(/exit 1/);
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
    expect(stepsOf(b).find((s) => s.uses?.startsWith("actions/checkout@")).with.ref).toBe("${{ github.event.workflow_run.head_sha }}");
    const zip = index(b, /Zip the unpacked app/), smoke = index(b, /Packaged app smoke test/), fuses = index(b, /fuses/);
    expect(index(b, /Build the installer/)).toBeLessThan(zip);
    expect(zip).toBeLessThan(fuses);
    expect(fuses).toBeLessThan(smoke);
    expect(stepsOf(b)[zip].run).toMatch(/Compress-Archive -Path apps\/desktop\/release\/win-unpacked\/\*/);
    expect(stepsOf(b)[zip].run).toMatch(/-Exclude __uninstaller\*/);
    expect(stepsOf(b)[zip].run).toMatch(/commit\.txt \$env:HEAD_SHA/);
  });

  it("writes SHA256SUMS before attesting", () => {
    const a = job("attest");
    expect(index(a, /^actions\/attest-build-provenance@/)).toBe(index(a, /sha256sum -- \* > SHA256SUMS/) + 1);
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

  it("L5: only a 404 means there's no preview yet; any other error fails the job", () => {
    const run = stepsOf(job("publish")).at(-1).run;
    expect(run).toMatch(/grep -q "HTTP 404"/);
    expect(run).not.toMatch(/2>\/dev\/null \|\| true/);
    expect(run).not.toMatch(/\|\| true/);
  });

  it("L11: escapes the commit subject's Markdown, as notes.mjs does", () => {
    const run = stepsOf(job("publish")).at(-1).run;
    expect(run).toContain("sed -E 's/([][\\\\`*_<>])/\\\\\\1/g'");
    expect(run).toMatch(/echo "> \$subject"/);
  });
});
