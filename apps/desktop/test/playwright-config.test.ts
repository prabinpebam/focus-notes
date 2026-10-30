import { describe, expect, it } from "vitest";
import source from "../playwright.config.ts";
import packaged from "../playwright.package.config.ts";

describe("source and exact-package journey selection", () => {
  const packageSpecs = [
    "e2e/rewrite-lifecycle-package.spec.ts",
    "e2e/rewrite-privacy-package.spec.ts",
    "e2e/rewrite-newfile-package.spec.ts",
    "C:\\journeys\\future-package.spec.ts",
  ];
  const sourceSpecs = [
    "e2e/rewrite-normal.spec.ts",
    "e2e/rewrite-lifecycle.spec.ts",
    "e2e/packaged.spec.ts",
    "e2e/baselines.spec.ts",
    "e2e/future.spec.ts",
  ];

  it("excludes package-required specs from ordinary source discovery", () => {
    expect(source.testIgnore).toBeInstanceOf(RegExp);
    for (const file of packageSpecs) expect((source.testIgnore as RegExp).test(file)).toBe(true);
    for (const file of sourceSpecs) expect((source.testIgnore as RegExp).test(file)).toBe(false);
    expect(source.testMatch).toBeUndefined();
  });

  it("explicitly selects only package-required specs, including future journeys", () => {
    expect(packaged.testMatch).toBeInstanceOf(RegExp);
    for (const file of packageSpecs) expect((packaged.testMatch as RegExp).test(file)).toBe(true);
    for (const file of sourceSpecs) expect((packaged.testMatch as RegExp).test(file)).toBe(false);
    expect(packaged.testIgnore).toEqual([]);
  });

  it("keeps the existing journey settings without retries or a setup bypass", () => {
    const { testIgnore: _sourceIgnore, outputDir: _sourceOutput, ...sourceSettings } = source;
    const { testIgnore: _packageIgnore, testMatch: _packageMatch, outputDir: _output, ...packageSettings } = packaged;
    expect(packageSettings).toEqual(sourceSettings);
    expect(packaged.outputDir).not.toBe(source.outputDir);
  });
});
