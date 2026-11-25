import { test, expect } from "./fixtures.ts";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { launch, quit } from "./helpers.ts";
import { instance } from "./instance.ts";
import { scheme } from "./surfaces.ts";

type Rect = { x: number; y: number; width: number; height: number };
const round = (r: Rect) => ({ x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) });

async function box(page: Page, selector: string): Promise<Rect> {
  return page.locator(selector).first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
}

// The owner, 25 Nov 13:04: "It spinning stuff that it should not spin." Only the border arc may move (D-356).
test("D-356: the backing-up status moves only its border arc; glyph, box and project pill stay still", async () => {
  const { dirs } = instance();
  const l = await launch(dirs);
  const { page, app } = l;
  const out = process.env.SPIN_FRAMES_DIR ?? test.info().outputDir;
  mkdirSync(out, { recursive: true });
  const send = (report: object) => app.evaluate(({ BrowserWindow }, report) => {
    const win = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes("index.html"))!;
    const wc = win.webContents as typeof win.webContents & { ownSend?: typeof win.webContents.send };
    // Only this journey speaks for sync: the throwaway folder's own status would end backing up mid-frame.
    if (!wc.ownSend) {
      wc.ownSend = wc.send.bind(wc);
      wc.send = (channel: string, ...args: unknown[]) => { if (channel !== "sync:status") wc.ownSend!(channel, ...args); };
    }
    wc.ownSend("sync:status", report);
  }, report);
  const capture = (rect: Rect) => app.evaluate(async ({ BrowserWindow }, rect) => {
    const win = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes("index.html"))!;
    win.webContents.invalidate();
    await new Promise((r) => setTimeout(r, 40));
    const img = await win.webContents.capturePage(rect);
    const size = img.getSize();
    return { bitmap: img.toBitmap().toString("base64"), png: img.toPNG().toString("base64"), width: size.width, height: size.height };
  }, round(rect));
  try {
    const icon = page.locator("#saveState");
    await expect(icon).toBeVisible();
    await page.mouse.move(500, 300);
    const neighbour = "[data-project-pill]";
    const hasPill = (await page.locator(neighbour).count()) > 0;
    for (const look of ["light", "dark", "reduced"] as const) {
      await scheme(page, look === "dark" ? "dark" : "light");
      await page.emulateMedia({ reducedMotion: look === "reduced" ? "reduce" : "no-preference" });
      await expect(async () => {
        await send({ git: true, state: "idle", waiting: 0 });
        await expect(icon).not.toHaveAttribute("data-state", "syncing", { timeout: 500 });
      }).toPass({ timeout: 10_000 });
      const rest = await box(page, "#saveState");
      const pillRest = hasPill ? await box(page, neighbour) : undefined;
      await expect(async () => {
        await send({ git: true, state: "syncing", waiting: 2 });
        await expect(icon).toHaveAttribute("data-state", "syncing", { timeout: 500 });
      }).toPass({ timeout: 10_000 });
      const arc = icon.locator('[data-border-progress="pending"]');
      await expect(arc).toHaveCount(1);
      const style = await arc.evaluate((el) => ({ name: getComputedStyle(el).animationName, border: getComputedStyle(el).borderTopStyle, transform: getComputedStyle(el).transform }));
      expect(style.transform).toBe("none");
      if (look === "reduced") expect(style).toMatchObject({ name: "none", border: "dashed" });
      else expect(style.name).not.toBe("none");
      // Nothing inside the control animates except the arc layer.
      expect(await icon.evaluate((el) => [el, ...el.querySelectorAll("*")]
        .filter((n) => !n.hasAttribute("data-border-progress") && getComputedStyle(n).animationName !== "none").length)).toBe(0);
      // Split the control's pixels: the ring band (hairline + arc stroke + antialiasing) and everything inside it.
      const bands = (f: { bitmap: string; width: number; height: number }) => {
        const px = Buffer.from(f.bitmap, "base64");
        const scale = f.width / rest.width;
        const cx = f.width / 2, cy = f.height / 2, r = Math.min(f.width, f.height) / 2;
        const inner: number[] = [], ring: number[] = [];
        for (let y = 0; y < f.height; y++) for (let x = 0; x < f.width; x++) {
          const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
          const at = (y * f.width + x) * 4;
          const rgb = [px[at]!, px[at + 1]!, px[at + 2]!];
          if (d < r - 4 * scale) inner.push(...rgb);
          else if (d < r) ring.push(...rgb);
        }
        return { inner: inner.join(","), ring: ring.join(",") };
      };
      const frames: { pill: Rect; neighbour?: Rect; inner: string; ring: string }[] = [];
      for (let i = 0; i < 6; i++) {
        await page.waitForTimeout(110);
        await expect(arc).toHaveCount(1);
        const pill = await box(page, "#saveState");
        const shot = await capture(pill);
        writeFileSync(join(out, `${look}-frame-${i}.png`), Buffer.from(shot.png, "base64"));
        frames.push({ pill, ...(hasPill ? { neighbour: await box(page, neighbour) } : {}), ...bands(shot) });
      }
      for (const f of frames) {
        expect(f.pill).toEqual(rest);
        if (pillRest) expect(f.neighbour).toEqual(pillRest);
        expect(f.inner, `${look}: the glyph must not move`).toBe(frames[0]!.inner);
      }
      const distinct = new Set(frames.map((f) => f.ring)).size;
      if (look === "reduced") expect(distinct, "reduced motion: a still dashed border").toBe(1);
      else expect(distinct, "the arc travels").toBeGreaterThan(1);
    }
    await send({ git: true, state: "idle", waiting: 0 });
  } finally { await quit(l); }
});
