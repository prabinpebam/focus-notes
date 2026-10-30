import { test, expect } from "@playwright/test";
import { numeric127StartupPrerequisite, frozenPackage } from "./rewrite-safety-faults.ts";

// This prerequisite deliberately runs WITHOUT starting Electron. A post-launch
// fetch wrapper cannot protect startup, native sockets, Git or account helpers.
// The lifecycle matrix must not be added below this gate until it passes.
test("AIR-SAFE-A startup prerequisite: all-channel numeric127 boundary before any app launch", async ({}, info) => {
  const identity = frozenPackage();
  await info.attach("frozen-package-identity", {
    body: JSON.stringify(identity, null, 2), contentType: "application/json",
  });
  const boundary = numeric127StartupPrerequisite();
  await info.attach("startup-boundary-observation", {
    body: JSON.stringify(boundary, null, 2), contentType: "application/json",
  });
  expect(boundary.nonLoopbackPermitted, JSON.stringify(boundary)).toBe(false);
});
