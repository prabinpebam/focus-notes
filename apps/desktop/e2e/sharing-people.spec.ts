import { test, expect } from "./fixtures.ts";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { existingInstance, openAccountSettings, start, world } from "./github-world.ts";
import { quit, type Launched } from "./helpers.ts";

async function close(l: Launched) {
  try { await quit(l); } finally {
    if (process.platform === "win32") for (const flags of [["-WhatIf"], []]) execFileSync("pwsh", ["-File", join(import.meta.dirname, "..", "..", "..", "tools", "dev", "close-test-apps.ps1"), "-OnlyPid", String(l.pid), ...flags], { stdio: "inherit" });
  }
}

test("G2.4/G2.5: personal invitation is real in the protocol fake, retains failures and permits writing while pending", async () => {
  test.setTimeout(90_000);
  const w = await world({ gcm: true });
  const { notes } = existingInstance(w);
  w.fakes.store(w.gh.token);
  w.git(w.root, "clone", "--quiet", "--recurse-submodules", notes, w.dirs.docs);
  const privateDir = join(w.dirs.docs, "private");
  w.git(privateDir, "checkout", "--quiet", "main");
  w.git(privateDir, "remote", "add", "github", "https://github.com/ada/notes-private.git");
  const before = readFileSync(join(privateDir, "notes", "secret.md"), "utf8");
  const l = await start(w, false);
  try {
    const { page } = l;
    await expect(page.getByRole("textbox", { name: "Note", exact: true })).toBeVisible();
    const settings = await openAccountSettings(page);
    await settings.getByRole("tab", { name: "Project", exact: true }).click();
    await settings.getByRole("button", { name: "Invite…", exact: true }).click();
    const invite = page.getByRole("dialog", { name: /^Invite to/ });
    await expect(invite.getByText("This project belongs to a personal GitHub account. A collaborator can read and change the whole private repository, including every note, sharing setting and share secret stored there. GitHub does not offer read-only access here.", { exact: true })).toBeVisible();
    await expect(invite.getByRole("radiogroup", { name: "Role" })).toHaveCount(0);
    await invite.getByRole("textbox", { name: "GitHub username", exact: true }).fill("octocat");
    await invite.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(w.gh.calls.filter(call => call.method === "PUT")).toHaveLength(0);
    await settings.getByRole("button", { name: "Invite…", exact: true }).click();
    await expect(invite.getByRole("textbox", { name: "GitHub username", exact: true })).toHaveValue("octocat");
    w.gh.fail("PUT /repos/ada/notes-private/collaborators/octocat", 403, "Forbidden");
    await expect(invite.getByText("ada/notes-private · Collaborator", { exact: true })).toBeVisible();
    await invite.getByRole("button", { name: "Send invite", exact: true }).click();
    await expect(invite.getByText("GitHub requires administrator access to invite someone. Check your project permissions on GitHub, then retry.", { exact: true })).toBeVisible();
    await expect(invite.getByRole("textbox", { name: "GitHub username", exact: true })).toHaveValue("octocat");
    expect(w.gh.repo("notes-private")!.invitations).toHaveLength(0);
    let release!: () => void;
    const waiting = new Promise<void>(resolve => { release = resolve; });
    w.gh.beforeRequest = async (method, path) => {
      if (method === "PUT" && path.includes("/collaborators/")) await waiting;
    };
    await invite.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(invite.getByText("Sending the invitation to GitHub…", { exact: true })).toBeVisible();
    await expect(invite.getByRole("textbox", { name: "GitHub username", exact: true })).toHaveAttribute("readonly", "");
    expect(w.gh.repo("notes-private")!.invitations).toHaveLength(0);
    await invite.getByRole("button", { name: "Close", exact: true }).click();
    await expect(settings.getByText("Sending the invitation to GitHub…", { exact: true })).toBeVisible();
    await settings.getByRole("button", { name: "Close", exact: true }).click();
    const editor = page.getByRole("textbox", { name: "Note", exact: true });
    await expect(editor).toBeEditable();
    await editor.press("Control+End");
    await editor.press("Enter");
    await editor.pressSequentially("Writing while GitHub checks the invitation.");
    await expect(editor).toContainText("Writing while GitHub checks the invitation.");
    release();
    await expect.poll(() => w.gh.repo("notes-private")!.invitations.length).toBe(1);
    await expect(settings).toBeHidden();
    await openAccountSettings(page);
    await settings.getByRole("tab", { name: "Project", exact: true }).click();
    await expect(settings.getByText("GitHub accepted the access request.", { exact: true })).toBeVisible();
    await expect(settings.getByText("octocat", { exact: true })).toBeVisible();
    await expect(settings.getByText("Pending", { exact: true })).toBeVisible();
    expect(w.gh.calls.filter(call => call.method === "PUT")).toHaveLength(2);
    expect(w.gh.repo("notes-private")!.invitations).toMatchObject([{ invitee: { login: "octocat" }, permissions: "push" }]);
    expect(readFileSync(join(privateDir, "notes", "secret.md"), "utf8")).toBe(before);
    expect(await page.evaluate(() => performance.getEntriesByName("fn:sharing.invite").length)).toBeGreaterThan(0);
  } finally {
    await close(l);
    w.server.close();
  }
});

test("G2.4: organization invitation offers only supported roles and sends the confirmed repository and role", async () => {
  test.setTimeout(90_000);
  const w = await world({ gcm: true });
  const { notes } = existingInstance(w);
  w.gh.add({ owner: "team", name: "book", private: true, ownerType: "Organization" });
  w.fakes.store(w.gh.token);
  w.git(w.root, "clone", "--quiet", "--recurse-submodules", notes, w.dirs.docs);
  const privateDir = join(w.dirs.docs, "private");
  w.git(privateDir, "checkout", "--quiet", "main");
  w.git(privateDir, "remote", "add", "github", "https://github.com/team/book.git");
  const l = await start(w, false);
  try {
    const settings = await openAccountSettings(l.page);
    await settings.getByRole("tab", { name: "Project", exact: true }).click();
    await settings.getByRole("button", { name: "Invite…", exact: true }).click();
    const invite = l.page.getByRole("dialog", { name: /^Invite to/ });
    const roles = invite.getByRole("radiogroup", { name: "Role", exact: true });
    await expect(roles.getByRole("radio")).toHaveCount(5);
    for (const role of ["Read", "Triage", "Write", "Maintain", "Admin"]) await expect(roles.getByRole("radio", { name: role, exact: true })).toBeVisible();
    await roles.getByText("Maintain", { exact: true }).click();
    await invite.getByRole("textbox", { name: "GitHub username", exact: true }).fill("octocat");
    await expect(invite.getByText("team/book · Maintain", { exact: true })).toBeVisible();
    await invite.getByRole("button", { name: "Send invite", exact: true }).click();
    await expect(settings.getByText("GitHub accepted the access request.", { exact: true })).toBeVisible();
    expect(w.gh.calls.filter(call => call.method === "PUT")).toEqual([expect.objectContaining({ path: "/repos/team/book/collaborators/octocat", body: { permission: "maintain" } })]);
    expect(w.gh.repos.get("team/book")!.invitations).toMatchObject([{ invitee: { login: "octocat" }, permissions: "maintain" }]);
  } finally {
    await close(l);
    w.server.close();
  }
});
