import { readFile, rename, writeFile } from "node:fs/promises";
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

/** Invitations this computer has seen, by repository: GitHub forgets one that was cancelled or declined. */
export interface KnownInvitations {
  read(): Promise<Record<string, { id: number; login: string; role: string }[]>>;
  write(value: Record<string, { id: number; login: string; role: string }[]>): Promise<void>;
}

export function memoryInvitations(): KnownInvitations {
  let value: Record<string, { id: number; login: string; role: string }[]> = {};
  return { read: async () => value, write: async next => { value = next; } };
}

/** `invitations.json` in the data folder: repository names, invitee logins, roles and invitation IDs only. */
export function invitationsFile(file: string): KnownInvitations {
  return {
    read: async () => {
      const text = await readFile(file, "utf8").catch(() => "");
      if (!text) return {};
      const value = JSON.parse(text) as { version?: unknown; repositories?: unknown };
      return value.version === 1 && value.repositories && typeof value.repositories === "object" ? value.repositories as Awaited<ReturnType<KnownInvitations["read"]>> : {};
    },
    write: async repositories => {
      const temp = `${file}.${process.pid}.tmp`;
      await writeFile(temp, `${JSON.stringify({ version: 1, repositories })}\n`);
      await rename(temp, file);
    },
  };
}

type Person = ProjectPeople["people"][number];

export function projectPeople(deps: {
  api: () => Promise<GitHubApi | undefined>;
  repository: () => Promise<string | undefined>;
  step?: (step: "check" | "send" | "accepted") => void;
  known?: KnownInvitations;
}) {
  const known = deps.known ?? memoryInvitations();
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
  const remember = async (repository: string, people: Person[]) => {
    const all = await known.read().catch(() => ({}) as Awaited<ReturnType<KnownInvitations["read"]>>);
    const key = repository.toLowerCase();
    const next = people.filter(p => p.state !== "accepted").map(p => ({ id: p.id, login: p.login, role: p.role }));
    const rest = { ...all };
    if (next.length) rest[key] = next; else delete rest[key];
    await known.write(rest).catch(() => {});
  };
  // Pending and expired come from GitHub's invitations, accepted from direct collaborators; an invitation
  // seen here before that has neither is revoked (cancelled, or declined: GitHub doesn't say which).
  const listing = async (ctx: Awaited<ReturnType<typeof context>>): Promise<ProjectPeople> => {
    const [invitations, collaborators, all] = await Promise.all([
      ctx.api.invitations(ctx.repo.owner, ctx.repo.name),
      ctx.api.collaborators(ctx.repo.owner, ctx.repo.name),
      known.read().catch(() => ({}) as Awaited<ReturnType<KnownInvitations["read"]>>),
    ]);
    const lower = (login: string) => login.toLowerCase();
    const invited: Person[] = invitations.map(i => ({ id: i.id, login: i.login, role: i.role, state: i.expired ? "expired" : "pending" }));
    const accepted: Person[] = collaborators.filter(c => lower(c.login) !== lower(ctx.repo.owner) && !invited.some(i => lower(i.login) === lower(c.login)))
      .map(c => ({ id: c.id, login: c.login, role: c.role, state: "accepted" }));
    const present = new Set([...invited, ...accepted].map(p => lower(p.login)));
    const revoked: Person[] = (all[ctx.repository.toLowerCase()] ?? []).filter(k => !present.has(lower(k.login)))
      .map(k => ({ id: k.id, login: k.login, role: k.role, state: "revoked" }));
    const people = [...invited, ...revoked, ...accepted];
    await remember(ctx.repository, people);
    return { repository: ctx.repository, owner: ctx.owner, roles: ctx.owner === "org" ? [...ROLES] : ["write"], people };
  };
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
          const same = (person: Person) => person.login.toLowerCase() === login.toLowerCase();
          const invitation = before.people.find(person => same(person) && (person.state === "pending" || person.state === "expired"));
          if (invitation?.state === "pending") {
            if (uncertain.has(attempt) && invitation.role === role) { uncertain.delete(attempt); deps.step?.("accepted"); return before; }
            throw failure("duplicate");
          }
          // Inviting again after expiry replaces GitHub's expired invitation with a new one.
          if (invitation) await ctx.api.cancelInvitation(ctx.repo.owner, ctx.repo.name, invitation.id);
          if (await ctx.api.isCollaborator(ctx.repo.owner, ctx.repo.name, login)) throw failure("collaborator");
          deps.step?.("send");
          uncertain.add(attempt);
          const sent = await ctx.api.inviteCollaborator(ctx.repo.owner, ctx.repo.name, account.login, role);
          uncertain.delete(attempt);
          deps.step?.("accepted");
          const people: Person[] = [...before.people.filter(person => !same(person)), ...(sent ? [{ ...sent, state: "pending" as const }] : [])];
          await remember(ctx.repository, people);
          return { ...before, people };
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
        if (!before.people.some(person => person.id === id && person.state === "pending")) throw failure("notfound");
        await ctx.api.cancelInvitation(ctx.repo.owner, ctx.repo.name, id);
        const people = before.people.map(person => (person.id === id && person.state === "pending" ? { ...person, state: "revoked" as const } : person));
        await remember(ctx.repository, people);
        return { ...before, people };
      } catch (error) { throw invitationProblem(error); }
    },
    /** Forgets a revoked invitation; GitHub has nothing left to change. */
    dismiss: async (repository: string, login: string): Promise<ProjectPeople> => {
      try {
        const ctx = await context();
        if (ctx.repository !== repository) throw failure("changed");
        const before = await listing(ctx);
        const people = before.people.filter(person => !(person.state === "revoked" && person.login.toLowerCase() === login.toLowerCase()));
        await remember(ctx.repository, people);
        return { ...before, people };
      } catch (error) { throw invitationProblem(error); }
    },
  };
}
