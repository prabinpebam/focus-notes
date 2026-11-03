import { describe, expect, it, vi } from "vitest";
import { waitForPublishedShare } from "../src/main/share/publication.ts";
import type { Grant } from "@focus-notes/seal";

const grant: Grant = {
  id: "sshare001", name: "", shareCode: "K7QM4DRP",
  salt: "AAAAAAAAAAAAAAAAAAAAAA", link: { secret: "fixture" }, scope: { notes: ["one.md"] },
  createdAt: "2026-11-03T00:00:00Z",
};
describe("publication readiness (SHR-16, MP.6/19)", () => {
  it("does not report ready on a successful push when the site still has no share", async () => {
    const publish = vi.fn(async () => {});
    await expect(waitForPublishedShare({
      grant, publish, get: async () => undefined, signal: new AbortController().signal,
      timeoutMs: 1, delayMs: 1,
    })).rejects.toThrow("access:notReady");
    expect(publish).toHaveBeenCalledOnce();
  });
  it("surfaces sync failure immediately and never falls back to copied output", async () => {
    const get = vi.fn(async () => undefined);
    await expect(waitForPublishedShare({
      grant, publish: async () => { throw new Error("access:offline"); }, get,
      signal: new AbortController().signal,
    })).rejects.toThrow("access:offline");
    expect(get).not.toHaveBeenCalled();
  });
  it("cancellation stops polling and does not claim success", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(waitForPublishedShare({
      grant, publish: async () => {}, get: async () => undefined, signal: controller.signal,
    })).rejects.toThrow("access:cancelled");
  });
});
