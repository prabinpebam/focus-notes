import { expect, it } from "vitest";
import { publicPublishing, type PublicTaskStep } from "../src/main/share/public-publishing.ts";

function harness(fail?: () => Error | undefined) {
  let site: readonly string[] = ["old.md"];
  const steps: PublicTaskStep[] = [], deployed: (readonly string[])[] = [];
  let release!: () => void;
  let gate = Promise.resolve();
  const service = publicPublishing({
    current: async () => site,
    record: async paths => { site = paths; },
    deploy: async (paths, _selection, step) => {
      step("publishing");
      await gate;
      const error = fail?.();
      if (error) throw error;
      deployed.push(paths);
      return "c".repeat(40);
    },
    step: s => steps.push(s),
  });
  return { service, steps, deployed, site: () => site, hold: () => { gate = new Promise(r => { release = r; }); return () => release(); } };
}

it("G3.1/G3.5: Publish records the set only after the exact deploy, streaming Saving then Publishing", async () => {
  const h = harness();
  await expect(h.service.publish({ notes: ["new.md"] })).resolves.toEqual({ commit: "c".repeat(40), published: ["new.md", "old.md"], changed: ["new.md"] });
  expect(h.steps).toEqual(["saving", "publishing"]);
  expect(h.site()).toEqual(["new.md", "old.md"]);
});

it("G3.4: a failed, offline or refused deploy never records Published, and Retry succeeds", async () => {
  for (const code of ["sharing:offline", "sharing:refused", "sharing:unacknowledged"]) {
    let error: Error | undefined = new Error(code);
    const h = harness(() => { const e = error; error = undefined; return e; });
    await expect(h.service.publish({ notes: ["new.md"] })).rejects.toThrow(code);
    expect(h.site()).toEqual(["old.md"]);
    expect(h.service.pending()).toBeUndefined();
    await expect(h.service.publish({ notes: ["new.md"] })).resolves.toMatchObject({ published: ["new.md", "old.md"] });
  }
});

it("G3.4: Unpublish deploys the site without the note, then records it; only published notes can be removed", async () => {
  const h = harness();
  await expect(h.service.unpublish(["missing.md"])).rejects.toThrow("sharing:scope");
  await expect(h.service.unpublish(["old.md"])).resolves.toMatchObject({ published: [], changed: ["old.md"] });
  expect(h.steps).toEqual(["removing", "publishing"]);
  expect(h.deployed).toEqual([[]]);
  expect(h.site()).toEqual([]);
});

it("G3.5: one task at a time, still running after its dialog closes, and visible to a reopened dialog", async () => {
  const h = harness();
  const release = h.hold();
  const task = h.service.publish({ notes: ["new.md"] });
  expect(h.service.pending()).toBe(task);
  expect(() => h.service.unpublish(["old.md"])).toThrow("sharing:busy");
  release();
  await task;
  expect(h.service.pending()).toBeUndefined();
});
