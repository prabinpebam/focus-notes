import { expect, it } from "vitest";
import { GitHubApi } from "@focus-notes/github";
import { FakeGitHub } from "../../../packages/github/test/fake-github.ts";
import { projectPeople } from "../src/main/share/people.ts";

function fixture(ownerType: "User" | "Organization" = "User") {
  const github = new FakeGitHub();
  const owner = ownerType === "User" ? "ada" : "team";
  const repo = github.add({ owner, name: "book", private: true, ownerType });
  const api = new GitHubApi(github.token, github.fetch);
  const steps: string[] = [];
  const service = projectPeople({ api: async () => api, repository: async () => `${owner}/book`, step: step => steps.push(step) });
  const puts = () => github.calls.filter(call => call.method === "PUT");
  return { github, repo, api, service, steps, puts, repository: `${owner}/book` };
}

it("sends exactly one GitHub request for repeated or concurrent personal invitations", async () => {
  const t = fixture();
  expect(await t.service.load()).toMatchObject({ owner: "personal", roles: ["write"], people: [] });
  const first = t.service.invite(t.repository, "octocat", "write");
  const second = t.service.invite(t.repository, "OCTOCAT", "write");
  expect(second).toBe(first);
  await expect(t.service.invite(t.repository, "octocat", "read")).rejects.toThrow("invite:busy");
  expect(await first).toMatchObject({ people: [{ login: "octocat", role: "write" }] });
  expect(t.puts()).toHaveLength(1);
  expect(t.puts()[0]).toMatchObject({ path: "/repos/ada/book/collaborators/octocat", body: { permission: "push" } });
  expect(t.steps).toEqual(["check", "send", "accepted"]);
  await expect(t.service.invite(t.repository, "octocat", "write")).rejects.toThrow("invite:duplicate");
  expect(t.puts()).toHaveLength(1);
});

it("reads all invitation pages before deciding whether a person is already invited", async () => {
  const t = fixture();
  t.repo.invitations = Array.from({ length: 101 }, (_, index) => ({ id: index + 1, invitee: { login: index === 100 ? "octocat" : `person-${index}` }, permissions: "push" }));
  expect((await t.service.load()).people).toHaveLength(101);
  await expect(t.service.invite(t.repository, "octocat", "write")).rejects.toThrow("invite:duplicate");
  expect(t.puts()).toHaveLength(0);
});

it.each(["read", "triage", "maintain", "admin"])("refuses %s on a personal account before any write", async role => {
  const t = fixture();
  await expect(t.service.invite(t.repository, "octocat", role)).rejects.toThrow("invite:role");
  expect(t.puts()).toHaveLength(0);
});

it.each(["read", "triage", "write", "maintain", "admin"] as const)("uses the supported organization role %s", async role => {
  const t = fixture("Organization");
  expect((await t.service.load()).roles).toEqual(["read", "triage", "write", "maintain", "admin"]);
  expect(await t.service.invite(t.repository, "octocat", role)).toMatchObject({ owner: "org", people: [{ role }] });
  expect(t.puts()).toHaveLength(1);
  expect(t.puts()[0]?.body).toEqual({ permission: role === "read" ? "pull" : role === "write" ? "push" : role });
});

it("reconciles an accepted request whose response was lost without sending another", async () => {
  const t = fixture();
  let loseResponse = true;
  const api = new GitHubApi(t.github.token, async (url, init) => {
    const response = await t.github.fetch(url, init);
    if (loseResponse && init?.method === "PUT") { loseResponse = false; throw new Error("lost response"); }
    return response;
  });
  const service = projectPeople({ api: async () => api, repository: async () => t.repository });
  await expect(service.invite(t.repository, "octocat", "write")).rejects.toThrow("invite:offline");
  expect(t.repo.invitations).toHaveLength(1);
  expect(await service.invite(t.repository, "octocat", "write")).toMatchObject({ people: [{ login: "octocat" }] });
  expect(t.puts()).toHaveLength(1);
});

it.each([
  [401, "Bad credentials", "signedout"],
  [403, "Forbidden", "refused"],
  [403, "API rate limit exceeded", "ratelimited"],
  [404, "Not Found", "notfound"],
  [422, "Invalid permission", "invalid"],
  [500, "Server error", "failed"],
] as const)("keeps GitHub %s failures unconfirmed and allows a checked retry", async (status, message, code) => {
  const t = fixture();
  t.github.fail("PUT /repos/ada/book/collaborators/octocat", status, message);
  await expect(t.service.invite(t.repository, "octocat", "write")).rejects.toThrow(`invite:${code}`);
  expect(t.steps).not.toContain("accepted");
  expect(t.repo.invitations).toHaveLength(0);
  expect(await t.service.invite(t.repository, "octocat", "write")).toMatchObject({ people: [{ login: "octocat" }] });
  expect(t.puts()).toHaveLength(2);
});

it("does not mutate an unlinked, non-admin, changed, invalid or existing-member project", async () => {
  const t = fixture();
  await expect(t.service.invite("ada/another", "octocat", "write")).rejects.toThrow("invite:changed");
  await expect(t.service.invite(t.repository, "bad/name", "write")).rejects.toThrow("invite:invalid");
  t.repo.collaborators.add("octocat");
  await expect(t.service.invite(t.repository, "octocat", "write")).rejects.toThrow("invite:collaborator");
  t.repo.canPush = false;
  await expect(t.service.load()).rejects.toThrow("invite:refused");
  t.repo.canPush = true;
  t.repo.private = false;
  await expect(t.service.load()).rejects.toThrow("invite:unlinked");
  expect(t.puts()).toHaveLength(0);
});

it("cancels only a pending invitation in the current private project", async () => {
  const t = fixture();
  const invited = await t.service.invite(t.repository, "octocat", "write");
  const id = invited.people[0]!.id;
  await expect(t.service.cancel("ada/another", id)).rejects.toThrow("invite:changed");
  await expect(t.service.cancel(t.repository, 0)).rejects.toThrow("invite:invalid");
  expect((await t.service.cancel(t.repository, id)).people).toEqual([]);
  expect(t.github.calls.filter(call => call.method === "DELETE")).toHaveLength(1);
});
