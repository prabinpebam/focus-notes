import { test, expect } from "./fixtures.ts";
import { packagedNewFile } from "./rewrite-newfile-package-fixture.ts";

for (const domain of ["public", "private"] as const) {
  test(`exact package ${domain}: existing frontmatter ID retains raw source and creates fresh destination ID`, async () => {
    test.setTimeout(60_000);
    const result = await packagedNewFile(domain, true);
    console.log("AIR-NEWFILE-MATRIX", JSON.stringify(result));
    expect(result.unexpectedAttempts).toEqual([]);
    expect(result.sourceUnchanged).toBe(true);
    expect(result.sourceIdRetained).toBe(true);
    expect(result.historyOriginalMatches).toBe(true);
    expect(result.historyDomains).toContain(domain);
    expect(result.closedPids).toEqual(result.pids);
    // Keep this acceptance red if whole-file frontmatter cannot reach creation.
    expect(result.created).toBe(true);
    expect(result.freshId).toBe(true);
    expect(result.sourceUnchangedAfterCreation).toBe(true);
  });

  test(`exact package ${domain}: supported-body collision, same-note window and dirty-source refuse without overwriting bytes`, async () => {
    test.setTimeout(60_000);
    const result = await packagedNewFile(domain, false);
    console.log("AIR-NEWFILE-MATRIX", JSON.stringify(result));
    expect(result.unexpectedAttempts).toEqual([]);
    expect(result.collisionRetained).toBe(true);
    expect(result.sameWindowRefused).toBe(true);
    expect(result.sourceUnchangedWithOtherWindow).toBe(true);
    expect(result.otherWindowClosed).toBe(true);
    expect(result.dirtyRefused).toBe(true);
    expect(result.dirtyBytesRetained).toBe(true);
    expect(result.created).toBe(true);
    expect(result.freshId).toBe(true);
    expect(result.sourceUnchangedAfterCreation).toBe(true);
    expect(result.historyOriginalMatches).toBe(true);
    expect(result.historyDomains).toContain(domain);
    expect(result.closedPids).toEqual(result.pids);
  });
}
