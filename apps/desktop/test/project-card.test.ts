/** A project card's GitHub line and size line (D-346): read only from the folder itself. */
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { countProject, githubRepo, gitRemotes, parseGitHubRemote } from "../src/main/project-card.ts";

const made: string[] = [];
async function folder() {
  const dir = await mkdtemp(join(tmpdir(), "fn-card-"));
  made.push(dir);
  return dir;
}
afterEach(async () => { for (const dir of made.splice(0)) await rm(dir, { recursive: true, force: true }); });

describe("project card", () => {
  it("reads owner/repo from https, scp-like and ssh GitHub remotes only", () => {
    expect(parseGitHubRemote("https://github.com/ana/book.git")).toBe("ana/book");
    expect(parseGitHubRemote("https://token@github.com/ana/book")).toBe("ana/book");
    expect(parseGitHubRemote("git@github.com:ana/book.git")).toBe("ana/book");
    expect(parseGitHubRemote("ssh://git@github.com/ana/my.notes.git")).toBe("ana/my.notes");
    for (const url of ["https://gitlab.com/ana/book", "http://github.com/ana/book", "https://github.com/ana", "https://github.com/-ana/book", "https://github.com/ana/../x", "file:///C:/book", "https://github.com.evil.example/ana/book"]) {
      expect(parseGitHubRemote(url), url).toBeUndefined();
    }
  });
  it("prefers origin, then any GitHub remote, and has no line without one", async () => {
    const config = '[core]\n\tbare = false\n[remote "upstream"]\n\turl = git@github.com:team/book.git\n[remote "origin"]\n\turl = https://example.com/book.git\n';
    expect([...gitRemotes(config)]).toEqual([["upstream", "git@github.com:team/book.git"], ["origin", "https://example.com/book.git"]]);
    const dir = await folder();
    expect(await githubRepo(dir)).toBeUndefined();
    await mkdir(join(dir, ".git"));
    await writeFile(join(dir, ".git", "config"), config);
    expect(await githubRepo(dir)).toBe("team/book");
    await writeFile(join(dir, ".git", "config"), `${config}[remote "origin"]\n\turl = https://github.com/ana/book.git\n`);
    expect(await githubRepo(dir)).toBe("team/book");
    await writeFile(join(dir, ".git", "config"), '[remote "origin"]\n\turl = https://github.com/ana/book.git\n[remote "upstream"]\n\turl = git@github.com:team/book.git\n');
    expect(await githubRepo(dir)).toBe("ana/book");
  });
  it("follows a worktree's .git file to its common config", async () => {
    const repo = await folder();
    await mkdir(join(repo, ".git", "worktrees", "w"), { recursive: true });
    await writeFile(join(repo, ".git", "config"), '[remote "origin"]\n\turl = git@github.com:ana/book.git\n');
    await writeFile(join(repo, ".git", "worktrees", "w", "commondir"), "../..\n");
    const tree = await folder();
    await writeFile(join(tree, ".git"), `gitdir: ${join(repo, ".git", "worktrees", "w")}\n`);
    expect(await githubRepo(tree)).toBe("ana/book");
  });
  it("counts bytes, files, recognised images and folders, leaving hidden ones out", async () => {
    const dir = await folder();
    await mkdir(join(dir, "notes", "media"), { recursive: true });
    await mkdir(join(dir, ".git", "objects"), { recursive: true });
    await writeFile(join(dir, "notes", "a.md"), "12345");
    await writeFile(join(dir, "notes", "media", "p.PNG"), "123");
    await writeFile(join(dir, "notes", "media", "q.jpeg"), "12");
    await writeFile(join(dir, "notes", "media", "r.svg"), "1");
    await writeFile(join(dir, ".hidden.md"), "123456789");
    await writeFile(join(dir, ".git", "objects", "x"), "123456789");
    expect(await countProject(dir)).toEqual({ bytes: 11, files: 4, media: 2, folders: 2 });
    expect(await countProject(await folder())).toEqual({ bytes: 0, files: 0, media: 0, folders: 0 });
    await expect(countProject(join(dir, "missing"))).rejects.toThrow();
  });
});
