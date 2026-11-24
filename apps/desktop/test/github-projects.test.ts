import { describe, expect, it, vi } from "vitest";
import type { Repo } from "@focus-notes/github";
import { PROJECT_MARKER, projectRepos } from "../src/main/github-projects.ts";

const repo = (name: string, extra: Partial<Repo> = {}): Repo => ({ owner: "ada", name, defaultBranch: "main", private: false, canPush: true, pushedAt: "2026-11-24T08:00:00Z", ...extra });
// The owner's account shape: a project, its private companion, this app's own repository (an instance too), and repositories that aren't projects.
const account = [repo("focus-notes"), repo("prabins-notes"), repo("prabins-notes-private", { private: true }), repo("atiya"), repo("pose-n-composition"), repo("designup-site"), repo("focus-notes-workspace", { template: true })];
const marked = new Set(["focus-notes", "prabins-notes", "prabins-notes-private", "focus-notes-workspace"]);

describe("Open from GitHub lists only Focus Notes projects (D-416)", () => {
  it("keeps repositories with the project marker, hides companions and templates, and never guesses", async () => {
    const hasFile = vi.fn(async (_o: string, name: string, path: string) => {
      expect(path).toBe(PROJECT_MARKER);
      if (name === "atiya") throw new Error("offline");
      return marked.has(name);
    });
    const unreadable = vi.fn();
    const found = await projectRepos({ hasFile }, account, new Map(), unreadable);
    expect(found.map((r) => r.name)).toEqual(["focus-notes", "prabins-notes"]);
    expect(unreadable).toHaveBeenCalledTimes(1);
    expect(hasFile).not.toHaveBeenCalledWith("ada", "focus-notes-workspace", PROJECT_MARKER);
  });

  it("asks each repository once per push, and a few at a time", async () => {
    let running = 0, most = 0;
    const hasFile = vi.fn(async (_o: string, name: string) => {
      most = Math.max(most, ++running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      return marked.has(name);
    });
    const many = Array.from({ length: 12 }, (_, i) => repo(`r${i}`));
    const cache = new Map<string, boolean>();
    await projectRepos({ hasFile }, many, cache, () => {});
    expect(most).toBeLessThanOrEqual(4);
    hasFile.mockClear();
    await projectRepos({ hasFile }, many, cache, () => {});
    expect(hasFile).not.toHaveBeenCalled();
    await projectRepos({ hasFile }, [repo("r0", { pushedAt: "2026-11-25T08:00:00Z" })], cache, () => {});
    expect(hasFile).toHaveBeenCalledTimes(1);
  });

  it("a check that failed is asked again next time", async () => {
    const hasFile = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(true);
    const cache = new Map<string, boolean>();
    expect(await projectRepos({ hasFile }, [repo("prabins-notes")], cache, () => {})).toEqual([]);
    expect((await projectRepos({ hasFile }, [repo("prabins-notes")], cache, () => {})).map((r) => r.name)).toEqual(["prabins-notes"]);
  });
});
