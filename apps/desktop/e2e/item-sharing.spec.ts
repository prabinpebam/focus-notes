import { test, expect } from "./fixtures.ts";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { launch, quit } from "./helpers.ts";
import { git, instance, write } from "./instance.ts";

test("SHR-13/14/15/24: Share… opens a fixed item, reviews contents and preserves the draft without writing a grant", async () => {
  const { dirs } = instance();
  const privateDir = join(dirs.docs, "private");
  write(join(privateDir, "notes", "trips", "rome.md"), "# Rome\n\nTrip plan.\n");
  write(join(privateDir, "notes", "trips", "ideas", "travel.md"), "# Travel\n");
  git(privateDir, "add", "-A");
  git(privateDir, "commit", "-qm", "Add test folder");
  const file = join(privateDir, "access.json");
  const before = existsSync(file) ? readFileSync(file, "utf8") : undefined;
  const l = await launch(dirs);
  try {
    const { page } = l;
    await expect(page.getByRole("textbox", { name: "Note" })).toBeVisible();
    await page.keyboard.press(process.platform === "darwin" ? "Meta+Shift+E" : "Control+Shift+E");
    const trips = page.getByRole("treeitem", { name: "trips", exact: true });
    await expect(trips).toBeVisible();
    await trips.click({ button: "right" });
    await page.getByRole("menuitem", { name: "Share…", exact: true }).click();
    const share = page.getByRole("dialog", { name: "Share “trips”", exact: true });
    await expect(share).toBeVisible();
    await expect(share.getByText("Folder · 2 notes · 1 folder", { exact: true })).toBeVisible();
    await expect(share.getByRole("switch", { name: /^Link / })).toBeChecked();
    await expect(share.getByRole("switch", { name: /^Passcode / })).not.toBeChecked();
    await expect(share.getByRole("switch", { name: /^Include notes added later / })).not.toBeChecked();
    await share.getByText("Link", { exact: true }).click();
    await expect(share.getByText("Keep Link or Passcode on to share this item.", { exact: true })).toBeVisible();
    await share.getByText("Passcode", { exact: true }).click();
    await share.getByText("Your own", { exact: true }).click();
    await share.getByLabel("Your passcode", { exact: true }).fill("harbor maple river cloud");
    await share.getByRole("button", { name: "Review contents", exact: true }).click();
    const review = page.getByRole("dialog", { name: "Contents of “trips”", exact: true });
    await expect(review).toBeVisible();
    await expect(review.getByRole("treeitem", { name: "Rome", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(review).not.toBeVisible();
    await expect(share.getByLabel("Your passcode", { exact: true })).toHaveValue("harbor maple river cloud");
    await expect(share.getByRole("button", { name: "Review contents", exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(share).not.toBeVisible();
    expect(existsSync(file) ? readFileSync(file, "utf8") : undefined).toBe(before);
  } finally {
    try { await quit(l); } finally {
      if (process.platform === "win32") execFileSync("pwsh", ["-File", join(import.meta.dirname, "..", "..", "..", "tools", "dev", "close-test-apps.ps1"), "-OnlyPid", String(l.pid)], { stdio: "inherit" });
    }
  }
});
