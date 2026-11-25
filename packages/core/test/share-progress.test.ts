import { describe, expect, it } from "vitest";
import { MessageCatalog } from "../src/messages.ts";
import { SHARE_PROGRESS_IDLE, SHARE_STEPS, shareProgressFail, shareProgressKeys, shareProgressStart, shareProgressStep, shareProgressView } from "../src/share-progress.ts";
import en from "../../views/messages/en.json" with { type: "json" };

const catalog = new MessageCatalog("en", en as Record<string, string>);

describe("share and publish progress (D-427)", () => {
  it("uses only plain words: no banned term in any step string", () => {
    const banned = /\b(pages|artifacts?|commits?|push(es|ed|ing)?|workflows?|deploy(s|ed|ing|ment)?|repositor(y|ies))\b/i;
    const keys = shareProgressKeys();
    expect(keys.length).toBeGreaterThan(40);
    for (const key of keys) {
      expect(catalog.has(key), key).toBe(true);
      expect(catalog.format(key, { step: "x" }), key).not.toMatch(banned);
    }
  });

  it("streams Turn on sharing in order, never backwards, and ends done", () => {
    let p = shareProgressStart("turnOn", SHARE_PROGRESS_IDLE, 0);
    const states = () => shareProgressView(p, catalog, 0).steps.map(s => s.state);
    expect(states()).toEqual(["running", "waiting", "waiting", "waiting"]);
    p = shareProgressStep(p, "prepare", 1000);
    p = shareProgressStep(p, "push", 2000);
    p = shareProgressStep(p, "deploy", 3000);
    // configurePublicSite's late "pages" belongs to an earlier step: it never unticks one.
    p = shareProgressStep(p, "pages", 4000);
    expect(states()).toEqual(["done", "done", "running", "waiting"]);
    expect(shareProgressView(p, catalog, 45_000).line).toBe("GitHub is putting your website up. This usually takes 1–2 minutes. 0:42");
    p = shareProgressStep(p, "slow", 125_000);
    expect(shareProgressView(p, catalog, 125_000).still).toMatch(/^Still working…/);
    p = shareProgressStep(p, "ready", 130_000);
    expect(states()).toEqual(["done", "done", "done", "done"]);
    expect(shareProgressView(p, catalog, 130_000).line).toBe("");
  });

  it("names the failed step, keeps what's done, and Retry carries on from it", () => {
    let p = shareProgressStart("turnOn", SHARE_PROGRESS_IDLE, 0);
    p = shareProgressStep(shareProgressStep(p, "push", 1), "deploy", 2);
    p = shareProgressFail(p);
    const failed = shareProgressView(p, catalog, 3);
    expect(failed.steps.map(s => s.state)).toEqual(["done", "done", "failed", "waiting"]);
    expect(failed.failedStep).toBe("Stopped at “GitHub puts your website up”. The steps before it are done and kept.");
    p = shareProgressStart("turnOn", p, 10);
    // The retry's own early phases (check, push) don't move it back.
    p = shareProgressStep(shareProgressStep(p, "check", 11), "push", 12);
    expect(shareProgressView(p, catalog, 13).steps.map(s => s.state)).toEqual(["done", "done", "running", "waiting"]);
    // A different operation starts from the top.
    expect(shareProgressStart("share", p, 20).at).toBe(0);
  });

  it("gives every operation its own steps", () => {
    for (const op of Object.keys(SHARE_STEPS) as (keyof typeof SHARE_STEPS)[]) {
      const view = shareProgressView(shareProgressStart(op, SHARE_PROGRESS_IDLE, 0), catalog, 0);
      expect(view.steps.length).toBeGreaterThanOrEqual(3);
      expect(view.steps.every(s => s.label && s.stateLabel)).toBe(true);
    }
  });
});
