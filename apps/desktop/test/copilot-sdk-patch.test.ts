import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

/**
 * D-438 patches @github/copilot-sdk to try a newer Copilot runtime protocol instead of refusing it
 * (patches/@github__copilot-sdk@1.0.28.patch). This fails when the SDK changes under the patch, so
 * it is re-made or, once the SDK accepts protocol 4 itself, removed.
 */
describe("the Copilot SDK protocol patch (D-438)", () => {
  const dist = dirname(dirname(createRequire(import.meta.url).resolve("@github/copilot-sdk")));
  const pkg = JSON.parse(readFileSync(join(dist, "..", "package.json"), "utf8")) as { version: string };

  it("is applied to the pinned SDK in both builds: only the minimum protocol is checked", () => {
    expect(pkg.version).toBe("1.0.28");
    for (const file of ["client.js", join("cjs", "client.js")]) {
      const source = readFileSync(join(dist, file), "utf8");
      expect(source).toMatch(/const MIN_PROTOCOL_VERSION = 3;/);
      expect(source).toContain("if (serverVersion < MIN_PROTOCOL_VERSION) {");
      expect(source).not.toContain("serverVersion > maxVersion");
    }
  });

  it("is still needed: the SDK's own protocol is 3 (remove the patch once it is 4 or more)", () => {
    expect(readFileSync(join(dist, "sdkProtocolVersion.js"), "utf8")).toMatch(/const SDK_PROTOCOL_VERSION = 3;/);
  });
});
