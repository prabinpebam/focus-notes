// The Microsoft Store package's manifest, read back from the built .msix (PKG-12, D-202): the
// focus-notes: scheme, the focus-notes command's alias, full trust, the executable and the identity
// Partner Center gave; and the Git it carries, with its license (PKG-13, D-228). Release and CI run
// it on every package they build.
//
//   node tools/release/store-manifest.mjs <file.msix | folder with one>
//
// MSSTORE_IDENTITY_NAME and MSSTORE_PUBLISHER, when set, must be the package's identity.
// An .msix (the same format as .appx) is a zip, often zip64, read here with Node alone: nothing to
// install on a runner.
import { closeSync, fstatSync, openSync, readdirSync, readSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { inflateRawSync } from "node:zlib";
import { NOT_REDISTRIBUTABLE } from "./git-bundle.mjs";

const read = (fd, at, length) => {
  const b = Buffer.alloc(length);
  let done = 0;
  while (done < length) {
    const n = readSync(fd, b, done, length - done, at + done);
    if (n === 0) throw new Error("The package ends early.");
    done += n;
  }
  return b;
};

/**
 * Walks a zip archive's central directory, calling `visit` with each file's name and a function that
 * reads its bytes; stops at, and returns, the first value `visit` returns.
 */
function eachZipEntry(file, visit) {
  const fd = openSync(file, "r");
  try {
    const size = fstatSync(fd).size;
    const tailAt = Math.max(0, size - (65535 + 22));
    const tail = read(fd, tailAt, size - tailAt);
    let eocd = -1;
    for (let i = tail.length - 22; i >= 0; i--) if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error("Not a zip archive.");
    let count = tail.readUInt16LE(eocd + 10), cdSize = tail.readUInt32LE(eocd + 12), cdAt = tail.readUInt32LE(eocd + 16);
    if (count === 0xffff || cdSize === 0xffffffff || cdAt === 0xffffffff) {
      const loc = eocd - 20;
      if (loc < 0 || tail.readUInt32LE(loc) !== 0x07064b50) throw new Error("A zip64 archive without its locator.");
      const z = read(fd, Number(tail.readBigUInt64LE(loc + 8)), 56);
      if (z.readUInt32LE(0) !== 0x06064b50) throw new Error("A zip64 archive without its end record.");
      count = Number(z.readBigUInt64LE(32)); cdSize = Number(z.readBigUInt64LE(40)); cdAt = Number(z.readBigUInt64LE(48));
    }
    const cd = read(fd, cdAt, cdSize);
    for (let p = 0, n = 0; n < count; n++) {
      if (cd.readUInt32LE(p) !== 0x02014b50) throw new Error("A damaged central directory.");
      const method = cd.readUInt16LE(p + 10), nameLen = cd.readUInt16LE(p + 28), extraLen = cd.readUInt16LE(p + 30), commentLen = cd.readUInt16LE(p + 32);
      let csize = cd.readUInt32LE(p + 20), usize = cd.readUInt32LE(p + 24), local = cd.readUInt32LE(p + 42);
      const entry = cd.toString("utf8", p + 46, p + 46 + nameLen);
      // Zip64's extra field holds, in this order, each size or offset the record marks 0xffffffff.
      for (let x = p + 46 + nameLen; x + 4 <= p + 46 + nameLen + extraLen;) {
        const id = cd.readUInt16LE(x), len = cd.readUInt16LE(x + 2);
        if (id === 1) {
          let q = x + 4;
          if (usize === 0xffffffff) { usize = Number(cd.readBigUInt64LE(q)); q += 8; }
          if (csize === 0xffffffff) { csize = Number(cd.readBigUInt64LE(q)); q += 8; }
          if (local === 0xffffffff) local = Number(cd.readBigUInt64LE(q));
        }
        x += 4 + len;
      }
      const entryAt = local;
      const result = visit(entry, () => {
        const h = read(fd, entryAt, 30);
        if (h.readUInt32LE(0) !== 0x04034b50) throw new Error(`A damaged entry: ${entry}.`);
        const data = read(fd, entryAt + 30 + h.readUInt16LE(26) + h.readUInt16LE(28), csize);
        if (method === 0) return data;
        if (method === 8) return inflateRawSync(data);
        throw new Error(`${entry} uses compression method ${method}.`);
      });
      if (result !== undefined) return result;
      p += 46 + nameLen + extraLen + commentLen;
    }
    return undefined;
  } finally {
    closeSync(fd);
  }
}

/** One file's bytes from a zip archive, or undefined when it has no such file. */
export function readZipEntry(file, name) {
  return eachZipEntry(file, (entry, bytes) => (entry === name ? bytes() : undefined));
}

/** Every file's name in a zip archive, as the archive spells it. */
export function zipEntryNames(file) {
  const names = [];
  eachZipEntry(file, (entry) => void names.push(entry));
  return names;
}

const attrs = (tag) => Object.fromEntries([...tag.matchAll(/([\w:]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map((m) => [m[1], m[2] ?? m[3]]));

/** What the package declares, from its AppxManifest.xml. */
export function readManifest(xml) {
  const tags = (re) => [...xml.matchAll(re)].map((m) => attrs(m[1]));
  const identity = tags(/<Identity\b([^>]*)>/g)[0] ?? {};
  return {
    identityName: identity.Name, publisher: identity.Publisher, version: identity.Version, architecture: identity.ProcessorArchitecture,
    executables: tags(/<Application\b([^>]*)>/g).map((a) => a.Executable),
    protocols: tags(/<uap:Protocol\b([^>]*)>/g).map((a) => a.Name),
    aliases: tags(/<(?:uap\d*|desktop):ExecutionAlias\b([^>]*)>/g).map((a) => a.Alias),
    aliasExtensions: tags(/<uap\d*:Extension\b([^>]*Category\s*=\s*["']windows\.appExecutionAlias["'][^>]*)>/g).map((a) => a.Executable),
    capabilities: tags(/<rescap:Capability\b([^>]*)>/g).map((a) => a.Name),
  };
}

/** Every way the manifest falls short of the Store package's design; empty when it's right. */
export function checkManifest(xml, expected = {}) {
  const m = readManifest(xml);
  const problems = [];
  const exe = "app\\focus-notes.exe";
  if (!m.executables.includes(exe)) problems.push(`The application isn't ${exe}.`);
  if (!m.protocols.includes("focus-notes")) problems.push("The focus-notes: protocol isn't declared.");
  if (!m.aliases.includes("focus-notes.exe") || !m.aliasExtensions.includes(exe)) problems.push("The focus-notes command's alias isn't declared for the app.");
  if (!m.capabilities.includes("runFullTrust")) problems.push("The runFullTrust capability is missing.");
  if (expected.identityName && m.identityName !== expected.identityName) problems.push(`The identity is ${m.identityName}, not ${expected.identityName}.`);
  if (expected.publisher && m.publisher !== expected.publisher) problems.push(`The publisher is ${m.publisher}, not ${expected.publisher}.`);
  return problems;
}

/**
 * Every packaged file that may not be redistributed (D-270): Git Credential Manager's Windows broker
 * natives, which git-bundle.mjs leaves out. Names are as the package spells them, percent-encoding
 * undone.
 */
export function redistributionProblems(names) {
  const decode = (n) => {
    try {
      return decodeURIComponent(n);
    } catch {
      return n;
    }
  };
  return names.map(decode).filter((n) => NOT_REDISTRIBUTABLE.test(n)).map((n) => `The package has ${n}, which may not be redistributed (D-270).`);
}

/** The bundled Git's files the package can't do without: Git, its sign-in helper, and Git's license. */
export const BUNDLED_GIT_FILES = ["app/resources/git/cmd/git.exe", "app/resources/git/ucrt64/bin/git-credential-manager.exe", "app/resources/git/LICENSE.txt"];

/** Every bundled Git file the package lacks (PKG-13, D-228); empty when it carries them all. */
export function bundledGitProblems(has) {
  return BUNDLED_GIT_FILES.filter((name) => !has(name)).map((name) => `The package has no ${name}: the Store package carries Git (PKG-13).`);
}

export const RUNTIME_NOTICE_FILES = ["app/LICENSES.chromium.html", "app/LICENSE.electron.txt", "app/resources/THIRD_PARTY_NOTICES.md"];

/** D-269 is limited to Electron's root FFmpeg DLL, with all runtime notices retained. */
export function runtimeLicenseProblems(names) {
  return [
    ...RUNTIME_NOTICE_FILES.filter((name) => !names.includes(name))
      .map((name) => `The package has no ${name}: runtime license notices must ship (D-269).`),
    ...codecLibraryProblems(names),
  ];
}

function codecLibraryProblems(names) {
  const problems = [];
  for (const encoded of names) {
    const name = decodeURIComponent(encoded).replace(/\\/g, "/");
    const file = name.slice(name.lastIndexOf("/") + 1);
    if (/^(?:lib)?(?:ffmpeg|avcodec|avformat|avutil|avfilter|avdevice|swresample|swscale|postproc).*?\.(?:dll|so(?:\.\d+)*|dylib|a|lib|node)$/i.test(file) && name !== "app/ffmpeg.dll") {
      problems.push(`The package has an additional or misplaced codec library: ${name} (D-269).`);
    }
  }
  return problems;
}

/** ASAR includes unpacked files in its header too, so native exclusions cover both payloads. */
export function copilotPayloadProblems(archive) {
  if (!archive || archive.length < 16) return ["The package has no readable app.asar."];
  const length = archive.readUInt32LE(12);
  if (length > archive.length - 16) return ["The package has a truncated ASAR header."];
  const header = JSON.parse(archive.toString("utf8", 16, 16 + length));
  if (!header.files || typeof header.files !== "object") return ["The ASAR header has no files."];
  const paths = [];
  const walk = (files, prefix) => {
    for (const [name, entry] of Object.entries(files)) {
      const path = prefix ? `${prefix}/${name}` : name;
      if (entry.files) walk(entry.files, path);
      else paths.push(path);
    }
  };
  walk(header.files, "");
  if (!paths.includes("out/main/main.mjs")) return ["The ASAR has no desktop main entry."];
  return [
    ...paths.filter((path) => /(?:^|\/)(?:@github\/copilot-sdk-(?:win32|darwin|linux)|@koromix\/|koffi\/|OneAuthInterop|browser-use\/|computer-use\/)/i.test(path))
      .map((path) => `The Store package contains an unused Copilot native/FFI/plugin asset: ${path}.`),
    ...codecLibraryProblems(paths.map((path) => `app/resources/app.asar/${path}`)),
  ];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = process.argv[2];
  if (!arg) {
    console.error("Usage: node tools/release/store-manifest.mjs <file.msix | folder with one>");
    process.exit(2);
  }
  let file = arg;
  if (statSync(arg).isDirectory()) {
    const found = readdirSync(arg).filter((f) => /\.(msix|appx)$/i.test(f));
    if (found.length !== 1) {
      console.error(`Expected one .msix in ${arg}, found ${found.length}.`);
      process.exit(1);
    }
    file = join(arg, found[0]);
  }
  const xml = readZipEntry(file, "AppxManifest.xml")?.toString("utf8");
  if (!xml) {
    console.error(`${file} has no AppxManifest.xml.`);
    process.exit(1);
  }
  const env = process.env;
  const problems = [
    ...checkManifest(xml, { identityName: env.MSSTORE_IDENTITY_NAME || undefined, publisher: env.MSSTORE_PUBLISHER || undefined }),
    ...bundledGitProblems((name) => readZipEntry(file, name) !== undefined),
    ...redistributionProblems(zipEntryNames(file)),
    ...runtimeLicenseProblems(zipEntryNames(file)),
    ...copilotPayloadProblems(readZipEntry(file, "app/resources/app.asar")),
  ];
  const m = readManifest(xml);
  console.log(`${file}: ${m.identityName} ${m.version} ${m.architecture}, ${m.publisher}; protocol ${m.protocols.join(", ")}; alias ${m.aliases.join(", ")}; ${m.capabilities.join(", ")}.`);
  for (const p of problems) console.error(p);
  process.exit(problems.length ? 1 : 0);
}
