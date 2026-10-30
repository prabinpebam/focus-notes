import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";

export const binarySource = "2d2e09bcfb4841550bee810ee15d3b1309dd03b0";
const executable = `E:\\Projects\\side-projects\\focus-notes-work\\preview\\candidates\\${binarySource}\\win-unpacked\\focus-notes.exe`;
export const lifecycleCells = ["checkpoint", "stream", "complete-review", "accepted-save"]
  .flatMap((phase) => ["orderly-close", "crash"].map((interruption) => ({
    phase, interruption, result: "UNMEASURED: startup boundary prerequisite not established",
  })));

export function frozenPackage() {
  if (process.env.FOCUS_NOTES_E2E_EXE !== executable) {
    throw new Error("AIR-SAFE-A requires the exact frozen FOCUS_NOTES_E2E_EXE; no source fallback");
  }
  const asar = join(dirname(executable), "resources", "app.asar");
  for (const file of [executable, asar]) {
    if (!existsSync(file)) throw new Error(`Missing immutable package: ${file}`);
  }
  const sha256 = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");
  return { binarySource, executable, executableSHA256: sha256(executable), asarSHA256: sha256(asar),
    lifecycleCells };
}

/**
 * Read-only, necessary OS boundary check, NOT a fence installer/certification.
 * A passing policy snapshot alone must never authorize app launch: loopback,
 * filter exclusions and blocked-attempt capture still need independent proof.
 * No Electron import/launch, credentials, accounts or network requests here.
 *
 * The existing post-launch fetch/Chromium observer cannot cover startup,
 * worker/native sockets or Git/gh children. Do not silently substitute it.
 * Real storage fault instrumentation is blocked until startup isolation exists.
 */
export function numeric127StartupPrerequisite(): {
  profiles: { name: string; enabled: boolean; outbound: string }[];
  broadOutboundAllowRules: number;
  nonLoopbackPermitted: boolean;
} {
  if (process.platform !== "win32") throw new Error("AIR-SAFE-A requires the Windows boundary check");
  const script = `
$ErrorActionPreference = 'Stop'
$profiles = @(Get-NetFirewallProfile -PolicyStore ActiveStore | ForEach-Object {
  @{ name = $_.Name; enabled = [bool]$_.Enabled; outbound = [string]$_.DefaultOutboundAction }
})
$broad = @(Get-NetFirewallRule -PolicyStore ActiveStore -Direction Outbound -Enabled True -Action Allow |
  Get-NetFirewallAddressFilter | Where-Object {
    @($_.RemoteAddress | Where-Object { $_ -ne '127.0.0.1' -and $_ -ne '127.0.0.1/32' }).Count -gt 0
  }).Count
@{ profiles = $profiles; broadOutboundAllowRules = $broad } | ConvertTo-Json -Depth 4 -Compress
`;
  // Fail closed on a command error; never "assume isolated" if policy is unreadable.
  const observed = JSON.parse(execFileSync("pwsh", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script],
    { encoding: "utf8", windowsHide: true, timeout: 20_000 })) as {
      profiles: { name: string; enabled: boolean; outbound: string }[];
      broadOutboundAllowRules: number;
    };
  if (observed.profiles.length !== 3 || !Number.isInteger(observed.broadOutboundAllowRules)) {
    throw new Error("AIR-SAFE-A cannot interpret the effective startup boundary");
  }
  return { ...observed, nonLoopbackPermitted: observed.broadOutboundAllowRules !== 0 ||
    observed.profiles.some((profile) => !profile.enabled || profile.outbound !== "Block") };
}
