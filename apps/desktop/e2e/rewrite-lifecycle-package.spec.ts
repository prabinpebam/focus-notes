import { test, expect } from "./fixtures.ts";
import { packagedLifecycle } from "./rewrite-lifecycle-package-fixture.ts";

for (const phase of ["checkpoint", "stream", "review", "save"] as const) {
  for (const ending of ["orderly", "kill"] as const) {
    test(`AIR-SAFE-A3 ${phase} x ${ending}`, async ({}, info) => {
      test.setTimeout(60_000);
      const evidence = await packagedLifecycle(phase, ending);
      await info.attach("lifecycle-evidence", { body: JSON.stringify(evidence, null, 2), contentType: "application/json" });
      console.log("AIR-SAFE-A3", JSON.stringify(evidence));
      expect(evidence.canonicalExact).toBe(true);
      expect(evidence.idsRetained).toBe(true);
      expect(evidence.originalsExact).toBe(true);
      expect(evidence.completeRetained).toBe(true);
      expect(evidence.partialDurable).toBe(false);
      expect(evidence.sameProfileRestart).toBe(true);
      expect(evidence.unexpectedAttempts).toEqual([]);
      expect(evidence.packageHashAfter).toBe(evidence.packageHashBefore);
      // These are safety assertions, NOT eight passing lifecycle acceptance cells.
      expect(evidence.status).toBe(phase === "checkpoint" || phase === "save" ? "GATEDUNMEASURED" : "PASS");
    });
  }
}
