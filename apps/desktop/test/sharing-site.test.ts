import { expect, it } from "vitest";
import { GitHubApi } from "@focus-notes/github";
import { FakeGitHub } from "../../../packages/github/test/fake-github.ts";
import { configurePublicSite, PUBLIC_SITE_WORKFLOW, publishSealedArtifact, type SealedArtifactPublisher } from "../src/main/share/site.ts";
import { sharingSetup, type SitePairing } from "../src/main/share/setup.ts";

it("PRJ-10: pushes only the public Pages workflow, never private-reader credentials or source", async () => {
  const github = new FakeGitHub();
  github.add({ owner: "ada", name: "book", private: true, files: ["notes/private.md", "access.json"] });
  const api = new GitHubApi(github.token, github.fetch);
  let saved: SitePairing | undefined;
  const service = sharingSetup({
    api: async () => api, project: async () => "ada/book", read: async () => saved, write: async p => { saved = p; },
    initialize: (pairing, step) => configurePublicSite(api, pairing, step),
    preserve: async () => {}, remove: async () => {},
  });
  const pairing = await service.enable("quiet-site");
  const publicRepo = github.repo("quiet-site")!;
  expect(publicRepo.fileContents.get(".github/workflows/pages.yml")).toBe(PUBLIC_SITE_WORKFLOW);
  expect(publicRepo.pages).toMatchObject({ build_type: "workflow" });
  expect(publicRepo.keys).toEqual([]);
  expect(publicRepo.secrets.size).toBe(0);
  expect([...publicRepo.files]).not.toContain("notes/private.md");
  expect([...publicRepo.files]).not.toContain("access.json");
  expect(PUBLIC_SITE_WORKFLOW).not.toMatch(/PRIVATE_CONTENT_KEY|secrets\.|schedule:|submodule update/);
  expect(PUBLIC_SITE_WORKFLOW).toContain("submodules: false");
  expect(PUBLIC_SITE_WORKFLOW).toContain("path: site");
  await configurePublicSite(api, pairing, () => {});
  expect(github.calls.filter(call => call.method === "PUT" && call.path.includes("/contents/"))).toHaveLength(1);
});

it("reconciles a lost workflow response without another write", async () => {
  const github = new FakeGitHub();
  github.add({ owner: "ada", name: "quiet-site" });
  const pairing: SitePairing = { version: 1, project: "ada/book", owner: "ada", name: "quiet-site", site: "https://ada.github.io/quiet-site/", intent: "11111111-1111-1111-1111-111111111111", phase: "created" };
  let lose = true;
  const api = new GitHubApi(github.token, async (url, init) => {
    const response = await github.fetch(url, init);
    if (lose && init?.method === "PUT") { lose = false; throw new Error("lost response"); }
    return response;
  });
  await expect(configurePublicSite(api, pairing, () => {})).rejects.toThrow("offline");
  await configurePublicSite(api, pairing, () => {});
  expect(github.calls.filter(call => call.method === "PUT")).toHaveLength(1);
});

it("does not replace a modified workflow on Retry", async () => {
  const github = new FakeGitHub();
  const repo = github.add({ owner: "ada", name: "quiet-site", files: [".github/workflows/pages.yml"] });
  repo.fileContents.set(".github/workflows/pages.yml", "Modified workflow");
  const api = new GitHubApi(github.token, github.fetch);
  await expect(configurePublicSite(api, { owner: "ada", name: "quiet-site" }, () => {})).rejects.toThrow("sharing:workflow");
  expect(github.calls.filter(call => call.method === "PUT")).toEqual([]);
});

it("the G3 artifact seam is explicit: a fake can confirm it, but absent production wiring never claims a push", async () => {
  const artifact = { directory: "sealed-output", build: "opaque-build" };
  await expect(publishSealedArtifact("ada/book", artifact)).rejects.toThrow("access:site.unavailable");
  const calls: string[] = [];
  const fake: SealedArtifactPublisher = async (project, output) => { calls.push(`${project}:${output.build}`); };
  await fake("ada/book", artifact);
  expect(calls).toEqual(["ada/book:opaque-build"]);
});
