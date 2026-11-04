import { test, expect } from "./fixtures.ts";
import { launch, quit, tempDirs } from "./helpers.ts";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const mod = process.platform === "darwin" ? "Meta" : "Control";

test("DD-RWR-12: the built app scans progressively to found, none and error, and Cancel stops pending probes", async () => {
  test.setTimeout(90_000);
  const dirs = tempDirs();
  writeFileSync(join(dirs.userData, "state.json"), JSON.stringify({ version: 1, firstRun: "done", projectIntroSeen: true }));
  // No installed CLI/account is contacted; HTTP probes go through the real service with protocol fakes.
  const l = await launch(dirs, { PATH: dirs.docs, COPILOT_CLI_PATH: "" });
  console.log(`toolbar-scan-owned-pid=${l.pid}`);
  try {
    const fake = async (mode: "found" | "none" | "error" | "cancel") => l.app.evaluate((_electron, mode) => {
      globalThis.fetch = async (input, init) => {
        const ollama = String(input).includes(":11434");
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, mode === "cancel" ? 10_000 : ollama ? 300 : 700);
          init?.signal?.addEventListener("abort", () => { clearTimeout(timer); reject(init.signal!.reason); }, { once: true });
        });
        if (mode === "error") return new Response("{}", { status: 200 });
        if (mode === "none" || !ollama) throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } });
        return new Response(JSON.stringify({ models: [{ name: "Synthetic local model" }] }), { headers: { "content-type": "application/json" } });
      };
    }, mode);
    const { page } = l;
    await page.keyboard.press(`${mod}+,`);
    const settings = page.getByRole("dialog", { name: "Settings", exact: true });
    await settings.getByRole("tab", { name: "AI", exact: true }).click();
    const find = settings.getByRole("button", { name: "Find on this PC", exact: true });
    const radar = settings.getByRole("group", { name: "Looking for AI models on this computer", exact: true });
    await fake("found");
    await find.click();
    await expect(radar).toHaveAttribute("aria-busy", "true");
    await expect(radar.getByText("Checking…", { exact: true }).first()).toBeVisible();
    await expect(radar.getByText("Found 1 app so far", { exact: true })).toBeVisible();
    await expect(radar.locator('li[data-status="found"]')).toHaveCount(1);
    await expect(radar.locator('li[data-status="checking"]').first()).toBeVisible();
    await expect(radar).toHaveAttribute("aria-busy", "false");
    await expect(radar.getByText("Found 1 app", { exact: true }).first()).toBeVisible();
    await expect(settings.getByRole("button", { name: "Set up", exact: true })).toBeVisible();

    await fake("none");
    await find.click();
    await expect(radar).toHaveAttribute("aria-busy", "true");
    await expect(radar).toHaveAttribute("aria-busy", "false");
    await expect(radar.getByText("0 apps found", { exact: true }).first()).toBeVisible();
    await expect(radar.locator('li[data-status="none"]')).toHaveCount(8);

    await fake("error");
    await find.click();
    await expect(radar).toHaveAttribute("aria-busy", "true");
    await expect(radar).toHaveAttribute("aria-busy", "false");
    await expect(radar.locator('li[data-status="error"]')).toHaveCount(7);
    await expect(settings.getByText(/Some apps could not be checked/, { exact: false }).first()).toBeVisible();

    await fake("cancel");
    await find.click();
    await expect(radar).toHaveAttribute("aria-busy", "true");
    await settings.getByRole("button", { name: "Cancel scan", exact: true }).click();
    await expect(radar).toHaveAttribute("aria-busy", "false");
    await expect(settings.getByText("Scan stopped. Completed results are kept.", { exact: true }).first()).toBeVisible();
    await expect(radar.locator('li[data-status="checking"]')).toHaveCount(0);
    await expect.poll(() => l.app.evaluate(() => performance.getEntriesByName("fn:ai.discover").length)).toBeGreaterThanOrEqual(3);
  } finally { await quit(l); }
});
