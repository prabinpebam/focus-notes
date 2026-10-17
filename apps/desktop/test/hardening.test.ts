/**
 * SEC-01, the Electron hardening checklist (Security and privacy → threat model): the renderer is
 * isolated and sandboxed with no Node, requests other than the app's own files are blocked, only
 * web links open in the browser, navigation and permissions are denied, the entry page carries the
 * strict CSP, and the packaging config sets the Electron fuses. When a packaged build is at hand
 * (FOCUS_NOTES_E2E_EXE, or release\win-unpacked after `electron-builder --dir`), the fuses are read
 * back from the executable itself.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { FuseV1Options, getCurrentFuseWire } from "@electron/fuses";
// The wire's bytes: '1' a fuse turned on, '0' turned off (@electron/fuses doesn't export its FuseState).
const FuseState = { ENABLE: 0x31, DISABLE: 0x30 } as const;
import { allowedRequest, HARDENED_WEB_PREFERENCES, isAppPage, isWebLink } from "../src/main/hardening.ts";
// The CSP every generated entry page carries (packages/ui/entry/template.mjs, plain JavaScript).
const template = "../../../packages/ui/entry/template.mjs";
const { DEFAULT_CSP } = (await import(template)) as { DEFAULT_CSP: string };

const here = join(import.meta.dirname, "..");
const pkg = JSON.parse(readFileSync(join(here, "package.json"), "utf8"));
const main = readFileSync(join(here, "src", "main", "main.ts"), "utf8");

/** The fuses the spec asks for, as electron-builder's config names them and as the binary does. */
const FUSES = [
  ["runAsNode", FuseV1Options.RunAsNode, false],
  ["enableNodeOptionsEnvironmentVariable", FuseV1Options.EnableNodeOptionsEnvironmentVariable, false],
  ["enableNodeCliInspectArguments", FuseV1Options.EnableNodeCliInspectArguments, false],
  ["enableCookieEncryption", FuseV1Options.EnableCookieEncryption, true],
  ["enableEmbeddedAsarIntegrityValidation", FuseV1Options.EnableEmbeddedAsarIntegrityValidation, true],
  ["onlyLoadAppFromAsar", FuseV1Options.OnlyLoadAppFromAsar, true],
] as const;

describe("SEC-01: the Electron hardening checklist", () => {
  it("accepts the same app file when Chromium and Node spell a portable short-path URL differently", () => {
    const path = "C:\\Users\\PRABIN~2\\AppData\\Local\\Temp\\portable\\resources\\app.asar\\out\\renderer\\index.html";
    for (const user of ["PRABIN~2", "PRABIN%7E2", "PRABIN%7e2"]) {
      expect(isAppPage(`file:///C:/Users/${user}/AppData/Local/Temp/portable/resources/app.asar/out/renderer/index.html?platform=windows#setup`, path, true)).toBe(true);
    }
    expect(isAppPage("file:///c:/users/prabin~2/appdata/local/temp/portable/resources/app.asar/out/renderer/index.html", path, true)).toBe(true);
    expect(isAppPage("file:///C:/Users/Prabin%20Pebam/app/index.html", "C:\\Users\\Prabin Pebam\\app\\index.html", true)).toBe(true);
    expect(isAppPage("file:///tmp/app/index.html?platform=linux", "/tmp/app/index.html", false)).toBe(true);
    expect(isAppPage("file:///tmp/App/index.html", "/tmp/app/index.html", false)).toBe(false);
  });

  it("still refuses requests from any other file, host, protocol or malformed file URL", () => {
    const path = "C:\\app\\out\\renderer\\index.html";
    for (const url of [
      "", "not a URL", "https://example.com/out/renderer/index.html",
      "file:///C:/other/out/renderer/index.html", "file:///C:/app/out/renderer/index.html/other",
      "file://server/app/out/renderer/index.html", "file:///C:/app/out/renderer/index%2F.html",
      "file:///C:/app/out/renderer/index.html%00", "file:///C:/app/out/renderer/%",
    ]) expect(isAppPage(url, path, true), url).toBe(false);
  });

  it("SEC-01: the renderer is isolated and sandboxed, with no Node and the web's security on", () => {
    expect(HARDENED_WEB_PREFERENCES).toMatchObject({
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
    });
    // The window takes them last, so nothing spread before them can turn them off.
    const prefs = /webPreferences: \{([^}]*)\}/.exec(main)?.[1] ?? "";
    expect(prefs).toContain("...HARDENED_WEB_PREFERENCES");
    expect(prefs).not.toMatch(/contextIsolation|sandbox|nodeIntegration|webSecurity/);
    expect(main.match(/new BrowserWindow\(/g)?.length).toBe(1);
  });

  it("SEC-01: no remote content loads, and only web links open in the browser", () => {
    expect(allowedRequest("file:///C:/app/out/renderer/index.html")).toBe(true);
    expect(allowedRequest("data:image/png;base64,AAAA")).toBe(true);
    for (const url of ["https://example.com/a.js", "http://127.0.0.1:9/", "ws://localhost/", "blob:https://x/1"]) expect(allowedRequest(url), url).toBe(false);
    for (const url of ["https://example.com", "http://example.com/x", "mailto:a@b.c"]) expect(isWebLink(url), url).toBe(true);
    for (const url of ["file:///C:/Windows/system32/calc.exe", "javascript:alert(1)", "ms-settings:", "https://", "\\\\server\\share"]) expect(isWebLink(url), url).toBe(false);
    expect(main).toContain("webRequest.onBeforeRequest");
  });

  it("SEC-01: navigation, new windows, webviews, and permission requests are denied", () => {
    expect(main).toMatch(/on\("will-navigate", \(e\) => e\.preventDefault\(\)\)/);
    expect(main).toMatch(/on\("will-redirect", \(e\) => e\.preventDefault\(\)\)/);
    expect(main).toMatch(/on\("will-attach-webview", \(e\) => e\.preventDefault\(\)\)/);
    expect(main).toMatch(/setWindowOpenHandler\([\s\S]*?return \{ action: "deny" \}/);
    expect(main).toContain("setPermissionRequestHandler((_wc, _perm, cb) => cb(false))");
    expect(main).toContain("setPermissionCheckHandler(() => false)");
  });

  it("SEC-01: the entry page's CSP allows only the app's own scripts and styles, with Trusted Types", () => {
    const rules = new Map(DEFAULT_CSP.split("; ").map((r) => [r.split(" ")[0], r.split(" ").slice(1).join(" ")]));
    expect(rules.get("default-src")).toBe("'none'");
    expect(rules.get("script-src")).toBe("'self'");
    expect(rules.get("style-src")).toBe("'self'");
    expect(rules.get("connect-src")).toBe("'self'");
    expect(rules.get("base-uri")).toBe("'none'");
    expect(rules.get("form-action")).toBe("'none'");
    expect(rules.get("frame-ancestors")).toBe("'none'");
    expect(rules.get("require-trusted-types-for")).toBe("'script'");
    expect(DEFAULT_CSP).not.toMatch(/unsafe-inline|unsafe-eval|\*|https?:/);
  });

  it("SEC-01: the packaging config sets the Electron fuses and packs the app into an ASAR", () => {
    expect(pkg.build.asar).toBe(true);
    for (const [name, , on] of FUSES) expect(pkg.build.electronFuses[name], name).toBe(on);
  });

  const exe = process.env.FOCUS_NOTES_E2E_EXE ?? join(here, "release", "win-unpacked", "focus-notes.exe");
  it.skipIf(!existsSync(exe))("SEC-01: the packaged executable carries the fuses (read from the binary)", async () => {
    const wire = await getCurrentFuseWire(exe);
    for (const [name, option, on] of FUSES) expect(wire[option], name).toBe(on ? FuseState.ENABLE : FuseState.DISABLE);
  });
});
