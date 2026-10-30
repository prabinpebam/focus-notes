import { test, expect } from "./fixtures.ts";
import { packagedPrivacy } from "./rewrite-privacy-package-fixture.ts";

test("exact package: public/private originals, complete/cancel/error, same-domain fresh files and receiving normal/mirror graphs stay private", async () => {
  test.setTimeout(180_000);
  const result = await packagedPrivacy();
  expect(result.domains).toEqual(["public", "private"]);
  expect(result.safeStorage).toBe(true);
  expect(result.sourceBytesUnchanged).toBe(true);
  expect(result.freshIds).toBe(true);
  expect(result.normalWriteGates).toEqual(["public:accept", "public:restore", "private:accept", "private:restore"]);
  expect(result.unexpectedAttempts).toEqual([]);
  expect(result.logHits).toEqual([]);
  expect(result.historyHits).toEqual([]);
  for (const receiver of result.receivers) {
    expect(receiver.publicArrived).toBe(true);
    expect(receiver.scan.objectCount).toBeGreaterThan(0);
    expect(receiver.scan.hits).toEqual([]);
  }
  console.log("AIR-SAFE-C2", JSON.stringify(result));
});
