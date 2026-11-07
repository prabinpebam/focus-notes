import { GitHubError, type GitHubApi, type CollaboratorRole } from "@focus-notes/github";
import type { ProjectPeople } from "@focus-notes/core";

const ROLES: CollaboratorRole[] = ["read", "triage", "write", "maintain", "admin"];
const isRole = (value: string): value is CollaboratorRole => ROLES.some(role => role === value);
const failure = (problem: string) => new Error(`invite:${problem}`);
export function invitationProblem(error: unknown): Error {
  if (error instanceof Error && /^invite:[a-z]+$/.test(error.message)) return error;
  if (error instanceof GitHubError) {
    return failure(error.status === 0 ? "offline" : error.unauthorized ? "signedout" : error.rateLimited ? "ratelimited"
      : error.status === 403 ? "refused" : error.status === 404 ? "notfound" : error.status === 422 ? "invalid" : "failed");
  }
  return failure("failed");
}

export function projectPeople(deps: {
  api: () => Promise<GitHubApi | undefined>;
  repository: () => Promise<string | undefined>;
  step?: (step: "check" | "send" | "accepted") => void;
}) {
  const pending = new Map<string, { role: string; promise: Promise<ProjectPeople> }>();
  const uncertain = new Set<string>();
  const context = async () => {
    const repository = await deps.repository();
    if (!repository || !/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(repository)) throw failure("unlinked");
    const api = await deps.api();
    if (!api) throw failure("signedout");
    const [owner, name] = repository.split("/");
    if (!owner || !name) throw failure("unlinked");
    const repo = await api.repo(owner, name);
    if (!repo.private || repo.template) throw failure("unlinked");
    if (!repo.canAdmin) throw failure("refused");
    if (!repo.ownerType) throw failure("failed");
    return { api, repo, repository, owner: repo.ownerType === "Organization" ? "org" as const : "personal" as const };
  };
  const listing = async (ctx: Awaited<ReturnType<typeof context>>): Promise<ProjectPeople> => ({
    repository: ctx.repository, owner: ctx.owner, roles: ctx.owner === "org" ? [...ROLES] : ["write"],
    people: await ctx.api.invitations(ctx.repo.owner, ctx.repo.name),
  });
  return {
    load: async (): Promise<ProjectPeople> => {
      try { return await listing(await context()); } catch (error) { throw invitationProblem(error); }
    },
    invite: (repository: string, login: string, role: string): Promise<ProjectPeople> => {
      const key = `${repository.toLowerCase()}:${login.toLowerCase()}`;
      const attempt = `${key}:${role}`;
      const existing = pending.get(key);
      if (existing) return existing.role === role ? existing.promise : Promise.reject(failure("busy"));
      const work = async () => {
        try {
          if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(login)) throw failure("invalid");
          deps.step?.("check");
          const ctx = await context();
          if (ctx.repository !== repository) throw failure("changed");
          if (!isRole(role) || ctx.owner === "personal" && role !== "write") throw failure("role");
          const account = await ctx.api.account(login);
          if (account.type !== "User") throw failure("invalid");
          const before = await listing(ctx);
          const invitation = before.people.find(person => person.login.toLowerCase() === login.toLowerCase());
          if (invitation) {
            if (uncertain.has(attempt) && invitation.role === role) { uncertain.delete(attempt); deps.step?.("accepted"); return before; }
            throw failure("duplicate");
          }
          if (await ctx.api.isCollaborator(ctx.repo.owner, ctx.repo.name, login)) throw failure("collaborator");
          deps.step?.("send");
          uncertain.add(attempt);
          const sent = await ctx.api.inviteCollaborator(ctx.repo.owner, ctx.repo.name, account.login, role);
          uncertain.delete(attempt);
          deps.step?.("accepted");
          return { ...before, people: sent ? [...before.people, sent] : before.people };
        } catch (error) { throw invitationProblem(error); }
      };
      const promise = work().finally(() => pending.delete(key));
      pending.set(key, { role, promise });
      return promise;
    },
    cancel: async (repository: string, id: number): Promise<ProjectPeople> => {
      try {
        if (!Number.isSafeInteger(id) || id <= 0) throw failure("invalid");
        const ctx = await context();
        if (ctx.repository !== repository) throw failure("changed");
        const before = await listing(ctx);
        if (!before.people.some(person => person.id === id)) throw failure("notfound");
        await ctx.api.cancelInvitation(ctx.repo.owner, ctx.repo.name, id);
        return { ...before, people: before.people.filter(person => person.id !== id) };
      } catch (error) { throw invitationProblem(error); }
    },
  };
}
