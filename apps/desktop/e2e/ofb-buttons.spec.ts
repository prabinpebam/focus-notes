import { test, expect } from "./fixtures.ts";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { quit } from "./helpers.ts";
import { card, existingInstance, heading, press, start, world } from "./github-world.ts";

test("OFB.1–OFB.4: found-notes buttons keep padded own-box paint through hover, press and focus", async () => {
  const w = await world({ gcm: true });
  w.fakes.store(w.gh.token);
  existingInstance(w);
  writeFileSync(join(w.dirs.userData, "state.json"), JSON.stringify({ version: 1, appearance: "system" }));
  const l = await start(w);
  try {
    await heading(l.page, "A quiet place to write");
    await press(l.page, "Enter");
    await expect(l.page.getByRole("button", { name: "Continue as Ada" })).toBeVisible({ timeout: 20_000 });
    await l.page.getByRole("button", { name: "Continue as Ada" }).click();
    await heading(l.page, "We found your notes");

    for (const width of [900, 480]) for (const colorScheme of ["light", "dark"] as const) {
      await l.app.evaluate(({ BrowserWindow }, width) => {
        BrowserWindow.getAllWindows()[0]!.setSize(width, 720);
      }, width);
      await l.app.evaluate(({ nativeTheme }, colorScheme) => {
        nativeTheme.themeSource = colorScheme;
        nativeTheme.emit("updated");
      }, colorScheme);
      await expect.poll(() => l.page.evaluate(() => document.documentElement.style.colorScheme)).toBe(colorScheme);
      for (const name of ["Create new notes instead", "More options", "Back"]) {
        const button = card(l.page).getByRole("button", { name, exact: true });
        await expect(button).toBeVisible();
        const padding = await button.evaluate(el => {
          const s = getComputedStyle(el);
          return [s.paddingInlineStart, s.paddingInlineEnd].map(Number.parseFloat);
        });
        expect(padding.every(value => value > 0), name).toBe(true);
      }
      const more = card(l.page).getByRole("button", { name: "More options", exact: true });
      await l.page.mouse.move(0, 0);
      const rest = await more.boundingBox();
      expect(rest).not.toBeNull();
      await more.evaluate(button => {
        button.setAttribute("data-ofb-recording", "");
        const frames: number[][] = [];
        const record = () => {
          const r = button.getBoundingClientRect();
          frames.push([r.x, r.y, r.width, r.height]);
          if (button.hasAttribute("data-ofb-recording")) requestAnimationFrame(record);
          else button.setAttribute("data-ofb-frames", JSON.stringify(frames));
        };
        requestAnimationFrame(record);
      });
      await more.hover();
      expect(await more.boundingBox()).toEqual(rest);
      // Real input delivered only to the hidden renderer, never to the owner's OS.
      await l.page.mouse.down();
      expect(await more.boundingBox()).toEqual(rest);
      await l.page.mouse.up();
      await expect(more).toHaveAttribute("aria-expanded", "true");
      expect(await more.boundingBox()).toEqual(rest);
      await more.focus();
      await l.page.keyboard.press("Tab");
      await l.page.keyboard.press("Shift+Tab");
      await expect(more).toBeFocused();
      expect(await more.boundingBox()).toEqual(rest);
      const frames = await more.evaluate(async button => {
        button.removeAttribute("data-ofb-recording");
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        return JSON.parse(button.getAttribute("data-ofb-frames") ?? "[]") as number[][];
      });
      expect(frames.length).toBeGreaterThan(0);
      expect(frames.every(frame => JSON.stringify(frame) === JSON.stringify([rest!.x, rest!.y, rest!.width, rest!.height]))).toBe(true);
      expect(await more.evaluate(el => getComputedStyle(el, "::before").content)).toBe("none");
      await l.page.screenshot({ path: join(test.info().outputDir, `found-notes-${width}-${colorScheme}.png`) });
      await more.click();
      await expect(more).toHaveAttribute("aria-expanded", "false");
    }
  } finally {
    await quit(l);
    w.server.close();
  }
});
