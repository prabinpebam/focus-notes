/**
 * PKG-13, D-228: the Git the Microsoft Store package carries is exactly the pinned dugite-native
 * archive. A different file is refused before anything is unpacked, a failed unpack leaves nothing
 * behind, and an unpacked bundle is reused only when its marker names the pinned SHA-256 and no file
 * in it has changed since; a link in it, or a risky system setting, is refused.
 */
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { archiveProblem, ensureGitBundle, isUnpacked, NOT_REDISTRIBUTABLE, notRedistributable, pinProblems, prepareBundle, readPin, RISKY_SETTING, treeDigest } from "../release/git-bundle.mjs";

const root = join(import.meta.dirname, "..", "..");
const tar = process.platform === "win32" ? join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe") : "tar";
const quiet = () => {};

/** A small stand-in archive with the bundle's shape, and a pin that names it. */
function fakeBundle(extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), "fn-git-bundle-"));
  const src = join(dir, "src");
  mkdirSync(join(src, "cmd"), { recursive: true });
  writeFileSync(join(src, "cmd", "git.exe"), "not really git");
  writeFileSync(join(src, "LICENSE.txt"), "GPL-2.0");
  for (const [rel, text] of Object.entries(extra)) {
    mkdirSync(join(src, rel, ".."), { recursive: true });
    writeFileSync(join(src, rel), text);
  }
  const tops = ["cmd", "LICENSE.txt", ...new Set(Object.keys(extra).map((rel) => rel.split("/")[0]))];
  const file = join(dir, "dugite-native-v0.0.0-test-windows-x64.tar.gz");
  const r = spawnSync(tar, ["-czf", file, "-C", src, ...tops], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr);
  const bytes = readFileSync(file);
  const pin = {
    ...readPin(),
    sha256: createHash("sha256").update(bytes).digest("hex"),
    size: bytes.length,
  };
  return { dir, file, pin, dest: join(dir, "vendor", "git") };
}

describe("The Store package's Git bundle (PKG-13, D-228)", () => {
  it("PKG-13: the pin names one dugite-native Windows x64 archive by SHA-256, and every component with its license and source", () => {
    const pin = readPin();
    expect(pinProblems(pin)).toEqual([]);
    expect(pin.url).toBe(`https://github.com/${pin.repository}/releases/download/${pin.tag}/${pin.asset}`);
    const names = pin.components.map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining(["Git for Windows", "Git Credential Manager", "Git LFS", "dugite-native"]));
    expect(pin.components.find((c) => c.name === "Git for Windows").version).toBe(pin.versions.git);
    expect(pin.components.find((c) => c.name === "Git Credential Manager").version).toBe(pin.versions.gcm);
  });

  it("PKG-13: a malformed pin is caught", () => {
    expect(pinProblems({ ...readPin(), sha256: "abc" })).toContain("sha256 isn't 64 lowercase hex digits.");
    expect(pinProblems({ ...readPin(), url: "https://example.com/git.tar.gz" })).toContain("url isn't a dugite-native release download.");
    expect(pinProblems({ ...readPin(), components: [{ name: "Git" }] }).length).toBeGreaterThan(0);
  });

  it("PKG-13: an archive of the wrong size or SHA-256 is refused, and nothing is unpacked", async () => {
    const { file, pin, dest } = fakeBundle();
    expect(await archiveProblem(file, pin)).toBeUndefined();
    expect(await archiveProblem(file, { ...pin, size: pin.size + 1 })).toMatch(/bytes, not the pinned/);
    const wrong = { ...pin, sha256: "0".repeat(64) };
    expect(await archiveProblem(file, wrong)).toMatch(/SHA-256 is [0-9a-f]{64}, not the pinned 0{64}/);
    await expect(ensureGitBundle({ pin: wrong, dest, archive: file, smoke: false, log: quiet })).rejects.toThrow(/Refusing the Git bundle/);
    expect(existsSync(dest)).toBe(false);
    expect(existsSync(`${dest}.unpacking`)).toBe(false);
    expect(existsSync(file)).toBe(true);
  });

  it("PKG-13: the pinned archive is unpacked into place with its marker, and reused after", async () => {
    const { file, pin, dest } = fakeBundle();
    const logs = [];
    await ensureGitBundle({ pin, dest, archive: file, smoke: false, log: (l) => logs.push(l) });
    expect(readFileSync(join(dest, "cmd", "git.exe"), "utf8")).toBe("not really git");
    expect(existsSync(join(dest, "LICENSE.txt"))).toBe(true);
    expect(await isUnpacked(dest, pin)).toBe(true);
    expect(await isUnpacked(dest, { ...pin, sha256: "1".repeat(64) })).toBe(false);
    expect(existsSync(`${dest}.unpacking`)).toBe(false);
    await ensureGitBundle({ pin, dest, archive: file, smoke: false, log: (l) => logs.push(l) });
    expect(logs.at(-1)).toMatch(/already in/);
  });

  it("PKG-13: a file changed, added or removed after unpacking means unpacking again from the checked archive", async () => {
    const { file, pin, dest } = fakeBundle();
    await ensureGitBundle({ pin, dest, archive: file, smoke: false, log: quiet });
    for (const change of [
      () => appendFileSync(join(dest, "LICENSE.txt"), "changed"),
      () => writeFileSync(join(dest, "cmd", "extra.exe"), "added"),
      () => rmSync(join(dest, "LICENSE.txt")),
    ]) {
      change();
      expect(await isUnpacked(dest, pin)).toBe(false);
      await ensureGitBundle({ pin, dest, archive: file, smoke: false, log: quiet });
      expect(await isUnpacked(dest, pin)).toBe(true);
      expect(readFileSync(join(dest, "LICENSE.txt"), "utf8")).toBe("GPL-2.0");
      expect(existsSync(join(dest, "cmd", "extra.exe"))).toBe(false);
    }
  });

  it("PKG-13: a link or junction in the bundle is refused: the package would follow it out of the bundle", async (ctx) => {
    const dir = mkdtempSync(join(tmpdir(), "fn-git-tree-"));
    mkdirSync(join(dir, "cmd"));
    writeFileSync(join(dir, "cmd", "git.exe"), "x");
    expect(await treeDigest(dir)).toMatch(/^[0-9a-f]{64}$/);
    try {
      symlinkSync(tmpdir(), join(dir, "out"), "junction");
    } catch {
      ctx.skip();
    }
    await expect(treeDigest(dir)).rejects.toThrow(/has a link: out/);
  });

  it("PKG-13: the bundle's system settings may not trust every folder, run other programs or pull in other settings", () => {
    for (const ok of ["credential.helper=manager", "core.autocrlf=true", "http.sslbackend=schannel", "filter.lfs.clean=git-lfs clean -- %f"]) expect(ok).not.toMatch(RISKY_SETTING);
    for (const bad of ["safe.directory=*", "core.hookspath=C:/x", "core.fsmonitor=true", "include.path=C:/x", "includeif.gitdir:C:/.path=x", "url.https://evil/.insteadof=https://github.com/", "http.sslverify=false", "credential.helper=store", "core.sshcommand=x"]) expect(bad).toMatch(RISKY_SETTING);
  });

  it("PKG-13: the unpacked bundle never enters the repository", () => {
    expect(readFileSync(join(root, ".gitignore"), "utf8")).toMatch(/^apps\/desktop\/vendor\/$/m);
  });

  it("D-270: Git Credential Manager's broker natives are left out, the managed MSAL stays, and the broker is off", async () => {
    const bin = "ucrt64/bin";
    const { file, pin, dest } = fakeBundle({
      [`${bin}/Microsoft.Identity.Client.NativeInterop.dll`]: "interop",
      [`${bin}/msalruntime.dll`]: "runtime",
      [`${bin}/msalruntime_arm64.dll`]: "runtime",
      [`${bin}/Microsoft.Identity.Client.dll`]: "MIT",
      [`${bin}/Microsoft.Identity.Client.Broker.dll`]: "MIT",
      [`${bin}/git-credential-manager.exe`]: "gcm",
      "etc/gitconfig": "[credential]\n\thelper = manager\n",
    });
    const logs = [];
    await ensureGitBundle({ pin, dest, archive: file, smoke: false, log: (l) => logs.push(l) });
    for (const gone of ["Microsoft.Identity.Client.NativeInterop.dll", "msalruntime.dll", "msalruntime_arm64.dll"]) expect(existsSync(join(dest, bin, gone)), gone).toBe(false);
    for (const kept of ["Microsoft.Identity.Client.dll", "Microsoft.Identity.Client.Broker.dll", "git-credential-manager.exe"]) expect(existsSync(join(dest, bin, kept)), kept).toBe(true);
    expect(notRedistributable(dest)).toEqual([]);
    expect(readFileSync(join(dest, "etc", "gitconfig"), "utf8")).toBe("[credential]\n\thelper = manager\n[credential]\n\tmsauthUseBroker = false\n");
    expect(logs.join("\n")).toMatch(/may not be redistributed \(D-270\): ucrt64\/bin\/Microsoft\.Identity\.Client\.NativeInterop\.dll, ucrt64\/bin\/msalruntime\.dll, ucrt64\/bin\/msalruntime_arm64\.dll/);
    expect(await isUnpacked(dest, pin)).toBe(true);
    // Preparing again changes nothing: the setting is written once.
    expect(prepareBundle(dest)).toEqual([]);
    expect(readFileSync(join(dest, "etc", "gitconfig"), "utf8").match(/msauthUseBroker/g)).toHaveLength(1);
  });

  it("D-270: a bundle unpacked before the broker natives were left out is unpacked again", async () => {
    const { file, pin, dest } = fakeBundle({ "ucrt64/bin/msalruntime.dll": "runtime" });
    await ensureGitBundle({ pin, dest, archive: file, smoke: false, log: quiet });
    const marker = JSON.parse(readFileSync(join(dest, ".focus-notes-bundle"), "utf8"));
    expect(marker.prepared).toBe("D-270");
    writeFileSync(join(dest, ".focus-notes-bundle"), JSON.stringify({ sha256: marker.sha256, tree: marker.tree }));
    expect(await isUnpacked(dest, pin)).toBe(false);
  });

  it("D-270: only the broker's natives are named, never Git Credential Manager or the managed MSAL", () => {
    for (const bad of ["ucrt64/bin/msalruntime.dll", "ucrt64/bin/msalruntime_x86.dll", "ucrt64/bin/MSALRUNTIME.DLL", "ucrt64/bin/Microsoft.Identity.Client.NativeInterop.dll", "msalruntime.dll"]) expect(bad).toMatch(NOT_REDISTRIBUTABLE);
    for (const ok of ["ucrt64/bin/Microsoft.Identity.Client.dll", "ucrt64/bin/Microsoft.Identity.Client.Broker.dll", "ucrt64/bin/Microsoft.Identity.Client.Extensions.Msal.dll", "ucrt64/bin/git-credential-manager.exe", "ucrt64/bin/gcmcore.dll", "ucrt64/doc/msalruntime.txt"]) expect(ok).not.toMatch(NOT_REDISTRIBUTABLE);
  });
});
