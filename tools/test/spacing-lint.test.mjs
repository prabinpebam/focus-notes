import { describe, expect, it } from "vitest";
import { lintSpacing } from "../../agentic-craft/tools/lint-spacing.mjs";
import { EXEMPT, lint } from "../spacing/lint.mjs";

describe("spacing owned by the layout (documentations/design/spacing-audit.md)", () => {
  it("finds no unexempted spacing errors in the design system's styles", async () => {
    const { files, errors } = await lint();
    expect(files).toBeGreaterThan(50);
    expect(errors).toEqual([]);
  }, 120_000);

  it("catches the dialog bug class: space set by a sibling's position, and an outer margin", () => {
    const found = lintSpacing(".dialog > :last-child { margin-block-end: 24px; }").map((f) => f.rule.split(":")[0]);
    expect(found).toContain("sibling-position spacing");
    expect(found).toContain("outer margin");
  });

  it("names a reason for every exemption", () => {
    for (const e of EXEMPT) expect(e.why.length).toBeGreaterThan(8);
  });
});
