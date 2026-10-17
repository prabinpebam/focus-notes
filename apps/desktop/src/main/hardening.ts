/**
 * The Electron hardening checklist's settings (SEC-01; Security and privacy → threat model), kept
 * apart from the main process so a unit test can read them: the renderer's web preferences, which
 * requests may load, and which links may open in the browser. The fuses are set at packaging time
 * (`electronFuses` in package.json) and read back from the packaged executable by the tests.
 */

import { fileURLToPath } from "node:url";

/** The renderer's web preferences: isolated, sandboxed, no Node, the web's own security on. */
export const HARDENED_WEB_PREFERENCES = {
  contextIsolation: true,
  sandbox: true,
  nodeIntegration: false,
  nodeIntegrationInWorker: false,
  nodeIntegrationInSubFrames: false,
  webSecurity: true,
  allowRunningInsecureContent: false,
  webviewTag: false,
} as const;

/** No network: only the app's own files, inline data, and DevTools may load (PRV-01, PKG-06). */
export function allowedRequest(url: string): boolean {
  return url.startsWith("file:") || url.startsWith("devtools:") || url.startsWith("data:");
}

/** Compare file identities, not URL spellings: Chromium leaves "~" literal, Node encodes it as "%7E". */
export function isAppPage(url: string, pagePath: string, windows = process.platform === "win32"): boolean {
  try {
    const path = fileURLToPath(url, { windows });
    return windows ? path.toLowerCase() === pagePath.toLowerCase() : path === pagePath;
  } catch {
    return false;
  }
}

/** Addresses a note's link may open in the browser: http, https, and mailto, well formed (EDT-13). */
export function isWebLink(url: string): boolean {
  if (!/^(https?:\/\/[^\s/?#]+|mailto:[^\s@]+@)\S*$/i.test(url)) return false;
  try {
    return Boolean(new URL(url));
  } catch {
    return false;
  }
}
