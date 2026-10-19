/**
 * The Microsoft Store package (PKG-12, D-202): an appx target beside NSIS, never instead of it; its
 * identity from Partner Center in one place (build.appx placeholders, overridden by the
 * MSSTORE_* variables); the manifest read back from the built package; release.yml building it with
 * no secrets, and store.yml submitting a published release's package only when the owner has set
 * the credentials, skipping cleanly with a notice when not.
 */
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";
import yaml from "js-yaml";
import { checkManifest, readManifest, readZipEntry } from "../release/store-manifest.mjs";
import { identityArgs, storeVersionProblem } from "../../apps/desktop/scripts/dist-store.mjs";
import { LIMITS, buildListing, overLimits, renderListing } from "../release/store-listing.mjs";

const root = join(import.meta.dirname, "..", "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const desktop = JSON.parse(read("apps/desktop/package.json"));
const workflow = (f) => { const text = read(`.github/workflows/${f}`); return { text, wf: yaml.load(text) }; };
const steps = (job) => job.steps ?? [];

/** A zip archive, with zip64 records when asked, the way makeappx may write one. */
function zip(entries, { zip64 = false } = {}) {
  const locals = [], central = [];
  let offset = 0;
  for (const [name, text, method] of entries) {
    const raw = Buffer.from(text), data = method === 8 ? deflateRawSync(raw) : raw, n = Buffer.from(name);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(45, 4); lh.writeUInt16LE(method, 8);
    lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(n.length, 26);
    locals.push(lh, n, data);
    const extra = Buffer.alloc(zip64 ? 28 : 0);
    if (zip64) {
      extra.writeUInt16LE(1, 0); extra.writeUInt16LE(24, 2);
      extra.writeBigUInt64LE(BigInt(raw.length), 4); extra.writeBigUInt64LE(BigInt(data.length), 12); extra.writeBigUInt64LE(BigInt(offset), 20);
    }
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(method, 10);
    ch.writeUInt32LE(zip64 ? 0xffffffff : data.length, 20); ch.writeUInt32LE(zip64 ? 0xffffffff : raw.length, 24);
    ch.writeUInt16LE(n.length, 28); ch.writeUInt16LE(extra.length, 30); ch.writeUInt32LE(zip64 ? 0xffffffff : offset, 42);
    central.push(ch, n, extra);
    offset += 30 + n.length + data.length;
  }
  const cd = Buffer.concat(central);
  const tail = [];
  if (zip64) {
    const z = Buffer.alloc(56);
    z.writeUInt32LE(0x06064b50, 0); z.writeBigUInt64LE(44n, 4);
    z.writeBigUInt64LE(BigInt(entries.length), 24); z.writeBigUInt64LE(BigInt(entries.length), 32);
    z.writeBigUInt64LE(BigInt(cd.length), 40); z.writeBigUInt64LE(BigInt(offset), 48);
    const loc = Buffer.alloc(20);
    loc.writeUInt32LE(0x07064b50, 0); loc.writeBigUInt64LE(BigInt(offset + cd.length), 8); loc.writeUInt32LE(1, 16);
    tail.push(z, loc);
  }
  const e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0);
  e.writeUInt16LE(zip64 ? 0xffff : entries.length, 8); e.writeUInt16LE(zip64 ? 0xffff : entries.length, 10);
  e.writeUInt32LE(zip64 ? 0xffffffff : cd.length, 12); e.writeUInt32LE(zip64 ? 0xffffffff : offset, 16);
  return Buffer.concat([...locals, cd, ...tail, e]);
}

// What electron-builder 26 writes for this package (checked against a local build).
const MANIFEST = `<?xml version="1.0" encoding="utf-8"?>
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10" xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10" xmlns:desktop="http://schemas.microsoft.com/appx/manifest/desktop/windows10" xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities">
  <Identity Name="Owner.FocusNotes" ProcessorArchitecture="x64" Publisher='CN=1A2B3C4D-0000-0000-0000-000000000000' Version="1.2.3.0" />
  <Capabilities><rescap:Capability Name="runFullTrust"/></Capabilities>
  <Applications>
    <Application Id="FocusNotes" Executable="app\\focus-notes.exe" EntryPoint="Windows.FullTrustApplication">
      <Extensions>
        <uap:Extension Category="windows.protocol"><uap:Protocol Name="focus-notes"><uap:DisplayName>Focus Notes</uap:DisplayName></uap:Protocol></uap:Extension>
${read("apps/desktop/build/appx-extensions.xml")}
      </Extensions>
    </Application>
  </Applications>
</Package>`;

describe("the package's manifest, read back (store-manifest.mjs)", () => {
  it("reads AppxManifest.xml from a stored, a deflated and a zip64 archive", () => {
    const dir = mkdtempSync(join(tmpdir(), "fn-store-"));
    for (const [i, [method, zip64]] of [[0, false], [8, false], [8, true]].entries()) {
      const file = join(dir, `p${i}.msix`);
      writeFileSync(file, zip([["assets/StoreLogo.png", "png", 0], ["AppxManifest.xml", MANIFEST, method]], { zip64 }));
      expect(readZipEntry(file, "AppxManifest.xml").toString("utf8")).toBe(MANIFEST);
      expect(readZipEntry(file, "AppxSignature.p7x")).toBeUndefined();
    }
    writeFileSync(join(dir, "bad.msix"), "not a zip");
    expect(() => readZipEntry(join(dir, "bad.msix"), "AppxManifest.xml")).toThrow(/Not a zip/);
  });

  it("finds the protocol, the command's alias, full trust and the identity", () => {
    expect(readManifest(MANIFEST)).toMatchObject({
      identityName: "Owner.FocusNotes", publisher: "CN=1A2B3C4D-0000-0000-0000-000000000000", version: "1.2.3.0",
      executables: ["app\\focus-notes.exe"], protocols: ["focus-notes"], aliases: ["focus-notes.exe"], capabilities: ["runFullTrust"],
    });
    expect(checkManifest(MANIFEST, { identityName: "Owner.FocusNotes", publisher: "CN=1A2B3C4D-0000-0000-0000-000000000000" })).toEqual([]);
  });

  it("names each thing a broken package lacks", () => {
    expect(checkManifest(MANIFEST.replace(/<uap3:Extension[\s\S]*<\/uap3:Extension>/, ""))).toEqual(["The focus-notes command's alias isn't declared for the app."]);
    expect(checkManifest(MANIFEST.replace('Name="focus-notes"', 'Name="other"'))).toEqual(["The focus-notes: protocol isn't declared."]);
    expect(checkManifest(MANIFEST.replace("runFullTrust", "internetClient"))).toEqual(["The runFullTrust capability is missing."]);
    expect(checkManifest(MANIFEST, { identityName: "Placeholder.FocusNotes" })).toEqual(["The identity is Owner.FocusNotes, not Placeholder.FocusNotes."]);
    expect(checkManifest(MANIFEST, { publisher: "CN=ms" })).toHaveLength(1);
  });
});

describe("the Store target in the build configuration", () => {
  it("keeps NSIS the direct download, and builds the Store package only by its own command", () => {
    expect(desktop.build.win.target).toEqual(["nsis"]);
    expect(desktop.scripts["dist:store"]).toBe("pnpm run build && node scripts/dist-store.mjs");
    expect(desktop.scripts.dist).not.toMatch(/appx/);
  });

  it("holds the identity's obvious placeholders in build.appx, and the rest of the package's description", () => {
    expect(desktop.build.appx).toMatchObject({
      identityName: "Placeholder.FocusNotes", publisher: "CN=00000000-0000-0000-0000-000000000000",
      applicationId: "FocusNotes", displayName: "Focus Notes", languages: ["en-US"],
      customExtensionsPath: "build/appx-extensions.xml", artifactName: "Focus-Notes-${version}-store-${arch}.msix",
    });
    expect([desktop.build.protocols].flat()).toEqual(expect.arrayContaining([expect.objectContaining({ schemes: ["focus-notes"] })]));
    expect(existsSync(join(root, "apps/desktop/build/appx/StoreLogo.scale-100.png"))).toBe(true);
    expect(JSON.parse(read("package.json")).scripts["check:generated"]).toContain("tools/release/store-assets.mjs --check");
  });

  it("takes Partner Center's identity from the environment, and knows a placeholder", () => {
    expect(identityArgs({})).toMatchObject({ args: [], placeholder: true });
    const real = identityArgs({ MSSTORE_IDENTITY_NAME: " Owner.FocusNotes ", MSSTORE_PUBLISHER: "CN=1A2B", MSSTORE_PUBLISHER_DISPLAY_NAME: "" });
    expect(real.args).toEqual(["-c.appx.identityName=Owner.FocusNotes", "-c.appx.publisher=CN=1A2B"]);
    expect(real.placeholder).toBe(false);
    expect(real.identity.publisherDisplayName).toBe(desktop.build.appx.publisherDisplayName);
    expect(identityArgs({ MSSTORE_IDENTITY_NAME: "Owner.FocusNotes" }).placeholder).toBe(true);
  });

  it("knows the Store refuses a version that starts with 0, or a section over 65535", () => {
    expect(storeVersionProblem("0.0.1")).toMatch(/can't start with 0/);
    expect(storeVersionProblem("0.9.12")).toMatch(/Store releases start at 1\.0\.0/);
    expect(storeVersionProblem("1.0.0")).toBeUndefined();
    expect(storeVersionProblem("2.10.3-rc.1")).toBeUndefined();
    expect(storeVersionProblem("1.70000.0")).toMatch(/65535/);
    expect(storeVersionProblem("one")).toMatch(/isn't a version/);
  });

  it("refuses, before building, a release build with the placeholders or a 0.x version", () => {
    const run = (env, ...args) => spawnSync(process.execPath, [join(root, "apps/desktop/scripts/dist-store.mjs"), "--require-identity", ...args], { env: { ...process.env, MSSTORE_IDENTITY_NAME: "", MSSTORE_PUBLISHER: "", ...env }, encoding: "utf8" });
    const placeholder = run({}, "-c.extraMetadata.version=1.0.0");
    expect(placeholder.status).toBe(2);
    expect(placeholder.stderr).toMatch(/placeholder identity/);
    const zero = run({ MSSTORE_IDENTITY_NAME: "Owner.FocusNotes", MSSTORE_PUBLISHER: "CN=1A2B" }, "-c.extraMetadata.version=0.4.0");
    expect(zero.status).toBe(2);
    expect(zero.stderr).toMatch(/refuses version 0\.4\.0/);
  });
});

describe("release.yml's store job: built and checked with no secrets", () => {
  const { wf } = workflow("release.yml");
  const job = wf.jobs.store;

  it("builds on Windows from the tag's version and the repository variables, then checks the manifest", () => {
    expect(job.needs).toBe("version");
    expect(job["runs-on"]).toBe("windows-latest");
    expect(job.permissions).toBeUndefined();
    expect(job.environment).toBeUndefined();
    for (const v of ["MSSTORE_IDENTITY_NAME", "MSSTORE_PUBLISHER", "MSSTORE_PUBLISHER_DISPLAY_NAME"]) expect(job.env[v]).toBe(`\${{ vars.${v} }}`);
    const build = steps(job).findIndex((s) => /run dist:store "-c\.extraMetadata\.version=\$VERSION"/.test(s.run ?? ""));
    const check = steps(job).findIndex((s) => /store-manifest\.mjs apps\/desktop\/release/.test(s.run ?? ""));
    expect(build).toBeGreaterThan(0);
    expect(check).toBe(build + 1);
    expect(steps(job)[build].run).toMatch(/--require-identity/);
  });

  it("releases the package only with a real identity; otherwise a notice and a short-lived check artifact", () => {
    const uploads = steps(job).filter((s) => s.uses?.startsWith("actions/upload-artifact@"));
    expect(uploads.map((u) => [u.if, u.with.name])).toEqual([
      ["steps.identity.outputs.release == 'true'", "asset-store"],
      ["steps.identity.outputs.release != 'true'", "store-package-placeholder"],
    ]);
    const identity = steps(job).find((s) => s.id === "identity").run;
    expect(identity).toMatch(/::notice title=Microsoft Store::No MSSTORE_IDENTITY_NAME/);
    expect(identity).toMatch(/"\$\{VERSION%%\.\*\}" = "0"/);
    expect(identity.match(/release=false/g)).toHaveLength(2);
    expect(wf.jobs.collect.needs).toContain("store");
  });
});

describe("store.yml: submits a published release's package to the Store", () => {
  const { text, wf } = workflow("store.yml");
  const job = wf.jobs.submit;
  const all = steps(job);

  it("runs when a release is published, or by hand for a tag; never on a pull request", () => {
    expect(wf.on.release).toEqual({ types: ["published"] });
    expect(wf.on.workflow_dispatch.inputs.tag).toMatchObject({ type: "string", required: true });
    expect(Object.keys(wf.on)).not.toContain("pull_request_target");
    expect(Object.keys(wf.on)).not.toContain("pull_request");
    expect(wf.permissions).toEqual({ contents: "read" });
    expect(job.permissions).toBeUndefined();
  });

  it("holds the credentials only in the release environment, and every action pinned by SHA", () => {
    expect(job.environment).toBe("release");
    for (const [, ref, rest] of text.matchAll(/^\s*(?:-\s+)?uses:\s*(\S+)(.*)$/gm)) {
      expect(ref).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/);
      expect(rest).toMatch(/#\s*v\d+/);
    }
    for (const s of all) if (s.run) expect(s.run, s.name).not.toContain("${{");
    expect(all.some((s) => s.uses?.startsWith("actions/checkout@"))).toBe(false);
  });

  it("skips cleanly, with a notice, until the owner sets all four secrets and the product ID; never a pre-release", () => {
    const ready = all[0];
    expect(ready.id).toBe("ready");
    for (const s of ["MSSTORE_TENANT_ID", "MSSTORE_CLIENT_ID", "MSSTORE_CLIENT_SECRET", "MSSTORE_SELLER_ID"]) expect(Object.values(ready.env)).toContain(`\${{ secrets.${s} }}`);
    expect(ready.env.PRODUCT_ID).toBe("${{ vars.MSSTORE_PRODUCT_ID }}");
    expect(ready.run).toMatch(/::notice title=Microsoft Store::Not submitted/);
    expect(ready.run).toMatch(/pre-release: not submitted/);
    expect(ready.run).toMatch(/"\$tag" == v0\.\*/);
    expect(ready.run.match(/submit=false/g)).toHaveLength(3);
    for (const s of all.slice(1)) expect(s.if, s.name ?? s.uses).toBe("steps.ready.outputs.submit == 'true'");
  });

  it("checks the package against the release's SHA256SUMS, then publishes it with msstore, telemetry off", () => {
    const fetch = all.find((s) => /SHA256SUMS/.test(s.name ?? ""));
    expect(fetch.run).toMatch(/gh release download "\$TAG" .*--pattern "\*-store-\*\.msix" --pattern SHA256SUMS/);
    expect(fetch.run).toMatch(/sha256sum --check --ignore-missing --strict SHA256SUMS/);
    expect(all.find((s) => s.uses)?.uses).toMatch(/^microsoft\/microsoft-store-apppublisher@/);
    const submit = all.at(-1).run;
    expect(submit.indexOf("--enableTelemetry false")).toBeLessThan(submit.indexOf("msstore reconfigure"));
    expect(submit).toMatch(/msstore publish \$package --appId \$env:MSSTORE_PRODUCT_ID/);
  });
});

describe("ci.yml packs the Store package on Windows", () => {
  it("after building the desktop app, with the manifest check, and no secrets", () => {
    const { text, wf } = workflow("ci.yml");
    const s = steps(wf.jobs.test);
    const build = s.findIndex((x) => x.name === "Build the desktop app");
    const store = s.findIndex((x) => /Store package check/.test(x.name ?? ""));
    expect(store).toBe(build + 1);
    expect(s[store].if).toMatch(/runner\.os == 'Windows'/);
    expect(s[store].run).toMatch(/dist-store\.mjs/);
    expect(s[store].run).toMatch(/store-manifest\.mjs/);
    expect(text).not.toMatch(/secrets\./);
  });
});

describe("the Store listing comes from the product site", () => {
  const landing = JSON.parse(read("site/landing.json"));
  const privacy = read("site/privacy.md").replace(/\r\n/g, "\n");
  const store = JSON.parse(read("store/listing.json"));

  it("takes its words from site/landing.json and site/privacy.md, and stays inside Partner Center's limits", () => {
    const l = buildListing(landing, privacy, store);
    expect(l.shortDescription).toBe(landing.line);
    expect(l.description.startsWith(landing.headline)).toBe(true);
    for (const f of landing.features) expect(l.description).toContain(f.headline);
    expect(l.description).toMatch(/^The app talks only to your computer and to GitHub/m);
    expect(l.description).not.toMatch(/this site|swatch/i);
    expect(overLimits(l, store.releaseNotesTemplate)).toEqual([]);
  });

  it("names the privacy and support URLs, the category and a draft age rating", () => {
    expect(store.privacyPolicyUrl).toBe("https://prabinpebam.github.io/focus-notes/privacy/");
    expect(store.supportUrl).toMatch(/^https:\/\/github\.com\/prabinpebam\/focus-notes\/issues$/);
    expect(store.category).toBe("Productivity");
    expect(store.ageRating.answers.length).toBeGreaterThan(0);
    expect(store.keywords.length).toBeLessThanOrEqual(LIMITS.keywords);
  });

  it("is committed as generated", () => {
    expect(read("store/listing.en-US.md").replace(/\r\n/g, "\n")).toBe(renderListing(landing, privacy, store));
  });

  it("reports each limit it breaks", () => {
    const long = { description: "x".repeat(LIMITS.description + 1), shortDescription: "s", features: ["y".repeat(LIMITS.feature + 1)], keywords: ["a", "b", "c", "d", "e", "f", "g", "h"] };
    expect(overLimits(long, "")).toHaveLength(3);
  });
});