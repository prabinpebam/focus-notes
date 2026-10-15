/**
 * D-157: a template repository is never someone's notes. The guard's answer for a repository and a
 * remote: the known templates without asking, GitHub's `is_template` kept for the session, and an
 * unknown answer that never blocks saving to a repository not known as a template.
 */
import { describe, expect, it } from "vitest";
import { TEMPLATE, TemplateGuard, knownTemplate, namesKnownTemplate, readRemote, remoteRepo } from "../src/main/git/template-guard.ts";
import { TEMPLATE as SETUP_TEMPLATE } from "../src/main/setup/engine.ts";

describe("D-157: which repositories are templates", () => {
  it("knows the source template by name, in any letter case, without asking GitHub", async () => {
    expect(SETUP_TEMPLATE).toEqual(TEMPLATE);
    expect(knownTemplate("PrabinPebam", "Focus-Notes-Workspace")).toBe(true);
    expect(knownTemplate("ada", "notes")).toBe(false);
    const asked: string[] = [];
    const g = new TemplateGuard({ lookup: async (o, n) => (asked.push(`${o}/${n}`), false) });
    expect(await g.isTemplateRepo("prabinpebam", "FOCUS-NOTES-WORKSPACE")).toBe(true);
    expect(asked).toEqual([]);
  });

  it("asks GitHub once a session, and keeps its last good answer when GitHub can't say", async () => {
    let now = 0;
    let answer: boolean | undefined | "throw" = true;
    const asked: string[] = [];
    const g = new TemplateGuard({
      lookup: async (o, n) => {
        asked.push(`${o}/${n}`);
        if (answer === "throw") throw new Error("offline");
        return answer;
      },
      now: () => now,
      freshMs: 1000,
    });
    expect(await g.check("ada", "my-template")).toBe("template");
    expect(await g.check("Ada", "My-Template")).toBe("template");
    expect(asked).toHaveLength(1);
    now = 5000;
    answer = "throw";
    expect(await g.check("ada", "my-template"), "offline: the last good answer stands").toBe("template");
    answer = undefined;
    expect(await g.isTemplateRepo("ada", "my-template")).toBe(true);
    // A repository GitHub never answered for isn't blocked: saving carries on offline.
    answer = "throw";
    expect(await g.check("ada", "notes")).toBe("unknown");
    expect(await g.isTemplateRepo("ada", "notes")).toBe(false);
    answer = false;
    expect(await g.check("ada", "notes")).toBe("notTemplate");
    answer = "throw";
    now = 99_000;
    expect(await g.check("ada", "notes")).toBe("notTemplate");
  });

  it("a slow GitHub doesn't hold saving up: after the timeout the answer is unknown", async () => {
    const g = new TemplateGuard({ lookup: () => new Promise(() => {}), timeoutMs: 20 });
    expect(await g.check("ada", "notes")).toBe("unknown");
    expect(await g.isTemplateRemote("https://github.com/ada/notes.git")).toBe(false);
    expect(await g.isTemplateRemote("https://github.com/prabinpebam/focus-notes-workspace.git"), "known: no need to ask").toBe(true);
  });

  it("reads the repository from a remote's URL: HTTPS, SSH, and the journeys' local remotes", async () => {
    expect(remoteRepo("https://github.com/prabinpebam/focus-notes-workspace.git")).toEqual(TEMPLATE);
    expect(remoteRepo("https://x-access-token@github.com/ada/notes")).toEqual({ owner: "ada", name: "notes" });
    expect(remoteRepo("https://GitHub.com/ada/notes/")).toEqual({ owner: "ada", name: "notes" });
    expect(remoteRepo("git@github.com:ada/notes.git")).toEqual({ owner: "ada", name: "notes" });
    expect(remoteRepo("ssh://git@github.com/ada/notes.git")).toEqual({ owner: "ada", name: "notes" });
    expect(remoteRepo("https://gitlab.com/ada/notes.git")).toBeUndefined();
    expect(remoteRepo("C:\\remotes\\ada\\notes.git")).toBeUndefined();
    expect(remoteRepo("C:/remotes/prabinpebam/focus-notes-workspace.git", "C:\\remotes")).toEqual(TEMPLATE);
    expect(remoteRepo("C:\\Remotes\\ada\\notes.git", "c:/remotes/")).toEqual({ owner: "ada", name: "notes" });
    expect(remoteRepo("C:/remotes/a/b/notes.git", "C:/remotes")).toBeUndefined();
    const g = new TemplateGuard({ lookup: async (_o, n) => n === "my-template", localBase: "C:/remotes" });
    expect(await g.isTemplateRemote("git@github.com:ada/my-template.git")).toBe(true);
    expect(await g.isTemplateRemote("C:/remotes/ada/my-template.git")).toBe(true);
    expect(await g.isTemplateRemote("C:/remotes/ada/notes.git")).toBe(false);
  });

  it("HIGH-2: reads SSH host aliases, ssh.github.com on 443, www.github.com, credentials, and trailing slashes or .git", () => {
    const ada = { kind: "repo", owner: "ada", name: "notes", github: true };
    for (const url of [
      "github-personal:ada/notes", "git@github-personal:ada/notes.git", "git@alias:/ada/notes.git/",
      "ssh://git@ssh.github.com:443/ada/notes.git", "https://www.github.com/ada/notes", "https://ada:secret@github.com/ada/notes.git/",
      "https://x-access-token:a@b@github.com/ada/notes", "ssh://work-alias/ada/notes",
    ]) expect(readRemote(url), url).toEqual(ada);
    // Not GitHub, and not an alias: another host, or a folder on this computer.
    expect(readRemote("https://gitlab.com/group/sub/notes.git")).toEqual({ kind: "other" });
    for (const url of ["C:\\remotes\\notes.git", "C:/remotes/notes.git", "/srv/git/notes.git", "../notes.git", "file:///srv/notes.git", "notes.git"]) expect(readRemote(url), url).toEqual({ kind: "local" });
    // What it can't read as owner/name on GitHub (or an alias for it).
    for (const url of ["", "   ", "https://github.com/ada", "https://github.com/ada/notes/extra", "git@github.com:notes.git", "github-personal:", "ssh://git@ssh.github.com:443/", "https://github.com/a%20b/notes"]) expect(readRemote(url), JSON.stringify(url)).toEqual({ kind: "unreadable" });
  });

  it("HIGH-2: finds a known template's name anywhere in a URL, in any letter case, as a whole name", () => {
    for (const url of [
      "github-personal:prabinpebam/focus-notes-workspace", "git@alias:Someone/FOCUS-NOTES-WORKSPACE.git", "https://gitlab.com/x/y/focus-notes-workspace",
      "C:\\clones\\Focus-Notes-Workspace.git", "https://github.com/prabinpebam/focus-notes-workspace/", "ssh://git@ssh.github.com:443/prabinpebam/focus-notes-workspace.git",
    ]) expect(namesKnownTemplate(url), url).toBe(true);
    for (const url of ["https://github.com/ada/notes.git", "https://github.com/ada/my-focus-notes-workspace-copy", "C:/x/focus-notes-workspaces.git"]) expect(namesKnownTemplate(url), url).toBe(false);
  });

  it("HIGH-2: a push goes only where it can tell isn't a template: unreadable remotes are refused, others ask GitHub", async () => {
    const asked: string[] = [];
    const g = new TemplateGuard({ lookup: async (o, n) => (asked.push(`${o}/${n}`), n === "my-template") });
    expect(await g.checkRemote("github-personal:ada/my-template")).toBe("template");
    expect(await g.checkRemote("git@alias:ada/notes.git")).toBe("ok");
    expect(asked).toEqual(["ada/my-template", "ada/notes"]);
    expect(await g.checkRemote("https://GITHUB.com/whoever/Focus-Notes-Workspace.git")).toBe("template");
    expect(await g.checkRemote("git@weird")).toBe("unreadable");
    expect(await g.checkRemote("https://github.com/ada")).toBe("unreadable");
    expect(await g.checkRemote("C:/remotes/notes.git")).toBe("ok");
    expect(await g.checkRemote("https://gitlab.com/ada/notes.git")).toBe("ok");
    expect(asked).toHaveLength(2);
    expect(await g.isTemplateRemote("git@weird"), "unreadable isn't a template; the push check refuses it separately").toBe(false);
  });
});
