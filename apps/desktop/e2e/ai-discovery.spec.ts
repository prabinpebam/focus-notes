import { test, expect } from "./fixtures.ts";
import { launch, quit, tempDirs } from "./helpers.ts";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const mod = process.platform === "darwin" ? "Meta" : "Control";

for (const appearance of ["light", "dark"] as const) {
test(`DD-RWR-12: ${appearance} scans progressively to found, none and error, and Cancel stops pending probes`, async () => {
  test.setTimeout(90_000);
  const dirs = tempDirs();
  writeFileSync(join(dirs.userData, "state.json"), JSON.stringify({ version: 1, firstRun: "done", projectIntroSeen: true, appearance, lightTheme: "paper", darkTheme: "ink" }));
  // No installed CLI/account is contacted; HTTP probes go through the real service with protocol fakes.
  const l = await launch(dirs, { PATH: dirs.docs, COPILOT_CLI_PATH: "" });
  console.log(`ai-scan-owned-pid=${l.pid}`);
  try {
    const fake = async (mode: "found" | "none" | "error" | "cancel") => l.app.evaluate((_electron, mode) => {
      const released = new Set<string>();
      const pending = new Map<string, () => void>();
      Reflect.set(globalThis, "releaseAiScanProbe", (provider: "ollama" | "all") => {
        released.add(provider);
        for (const [url, resolve] of pending) {
          if (provider === "all" || url.includes(":11434")) { pending.delete(url); resolve(); }
        }
      });
      globalThis.fetch = async (input, init) => {
        const url = String(input);
        const ollama = url.includes(":11434");
        if (!released.has("all") && !(ollama && released.has("ollama"))) await new Promise<void>((resolve, reject) => {
          pending.set(url, resolve);
          init?.signal?.addEventListener("abort", () => { pending.delete(url); reject(init.signal!.reason); }, { once: true });
        });
        if (mode === "error") return new Response("{}", { status: 200 });
        if (mode === "none" || !ollama) throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } });
        return new Response(JSON.stringify({ models: [{ name: "Synthetic local model" }] }), { headers: { "content-type": "application/json" } });
      };
    }, mode);
    const release = async (provider: "ollama" | "all") => l.app.evaluate((_electron, provider) => {
      const release = Reflect.get(globalThis, "releaseAiScanProbe");
      if (typeof release !== "function") throw new Error("Missing scan protocol fixture");
      release(provider);
    }, provider);
    const { page } = l;
    await page.emulateMedia({ colorScheme: appearance, reducedMotion: appearance === "dark" ? "reduce" : "no-preference" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", appearance === "dark" ? "ink" : "paper");
    await page.keyboard.press(`${mod}+,`);
    const settings = page.getByRole("dialog", { name: "Settings", exact: true });
    await settings.getByRole("tab", { name: "AI", exact: true }).click();
    const find = settings.getByRole("button", { name: "Find on this PC", exact: true });
    const radar = settings.getByRole("group", { name: "Looking for AI models on this computer", exact: true });
    // Fixture releases, not assertion round trips, control these probes. Protocol units cover deadlines.
    await l.app.evaluate(() => {
      const { mock } = process.getBuiltinModule("node:test");
      mock.timers.enable({ apis: ["setTimeout"] });
    });
    await fake("found");
    await find.click();
    await expect(radar).toHaveAttribute("aria-busy", "true");
    await expect(radar.getByText("Checking…", { exact: true }).first()).toBeVisible();
    await release("ollama");
    await expect(radar.getByText("Found 1 app so far", { exact: true })).toBeVisible();
    await expect(radar.locator('li[data-status="found"]')).toHaveCount(1);
    await expect(radar.locator('li[data-status="checking"]').first()).toBeVisible();
    await release("all");
    await expect(radar).toHaveAttribute("aria-busy", "false");
    await expect(radar.getByText("Found 1 app", { exact: true }).first()).toBeVisible();
    await expect(settings.getByRole("button", { name: "Set up", exact: true })).toBeVisible();
    const geometry = await radar.evaluate(element => {
      const disc = element.firstElementChild!;
      const core = disc.lastElementChild!;
      const blip = disc.children[1]!;
      const bounds = disc.getBoundingClientRect();
      const centered = core.getBoundingClientRect();
      const found = blip.getBoundingClientRect();
      const radius = (bounds.width + Number.parseFloat(getComputedStyle(core).width)) / 4;
      return {
        coreX: centered.x + centered.width / 2 - bounds.x - bounds.width / 2,
        coreY: centered.y + centered.height / 2 - bounds.y - bounds.height / 2,
        blipX: found.x + found.width / 2 - bounds.x - bounds.width / 2,
        blipY: found.y + found.height / 2 - bounds.y - bounds.height / 2,
        radius,
        sweep: getComputedStyle(disc.firstElementChild!).animationName,
        blip: getComputedStyle(blip).animationName,
        pulse: getComputedStyle(blip, "::after").animationName,
        mark: getComputedStyle(element.querySelector('li[data-status="found"]')!.lastElementChild!).animationName,
      };
    });
    expect(Math.abs(geometry.coreX)).toBeLessThan(1);
    expect(Math.abs(geometry.coreY)).toBeLessThan(1);
    expect(Math.abs(geometry.blipX - Math.sin(Math.PI / 8) * geometry.radius)).toBeLessThan(1);
    expect(Math.abs(geometry.blipY + Math.cos(Math.PI / 8) * geometry.radius)).toBeLessThan(1);
    if (appearance === "dark") expect([geometry.sweep, geometry.blip, geometry.pulse, geometry.mark]).toEqual(["none", "none", "none", "none"]);

    await fake("none");
    await find.click();
    await expect(radar).toHaveAttribute("aria-busy", "true");
    await release("all");
    await expect(radar).toHaveAttribute("aria-busy", "false");
    await expect(radar.getByText("0 apps found", { exact: true }).first()).toBeVisible();
    await expect(radar.locator('li[data-status="none"]')).toHaveCount(8);

    await fake("error");
    await find.click();
    await expect(radar).toHaveAttribute("aria-busy", "true");
    await release("all");
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
  } finally {
    try { await l.app.evaluate(() => { const { mock } = process.getBuiltinModule("node:test"); mock.timers.reset(); }); }
    finally { await quit(l); }
  }
});
}
