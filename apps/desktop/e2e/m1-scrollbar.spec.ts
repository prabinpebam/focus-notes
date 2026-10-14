/** UI-09 (D-73): the minimal scrollbar hides at rest, shows while scrolling or near its edge, and never shifts the layout. */
import { test, expect } from "./fixtures.ts";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { launch, quit, tempDirs } from "./helpers.ts";

test("UI-09: the scrollbar hides at rest, shows while scrolling and on hover, and nothing moves", async () => {
  const dirs = tempDirs();
  writeFileSync(join(dirs.docs, "Welcome.md"), Array.from({ length: 80 }, (_, i) => `Paragraph ${i + 1} with enough words to fill the page.`).join("\n\n") + "\n");
  const l = await launch(dirs);
  const { page } = l;
  await expect(page.getByRole("textbox", { name: "Note" })).toBeFocused();
  const scroller = page.locator("[data-editor-scroller]");
  const state = () => scroller.evaluate((el: HTMLElement) => {
    const thumb = getComputedStyle(el, "::-webkit-scrollbar-thumb").backgroundColor;
    const button = getComputedStyle(el, "::-webkit-scrollbar-button").display;
    return { gutter: el.offsetWidth - el.clientWidth, thumb, button, contentLeft: el.querySelector("[data-editor]")!.getBoundingClientRect().left, scrolling: "scrolling" in el.dataset, hover: "scrollbarHover" in el.dataset };
  });
  // Opening scrolls to the caret at the end, which shows the scrollbar briefly; then it goes idle.
  // (Waiting for idle alone could pass before that scroll has started.)
  await expect.poll(async () => (await scroller.evaluate((el) => el.scrollTop)) > 0 && !(await state()).scrolling, { timeout: 3000 }).toBe(true);
  const rest = await state();
  expect(rest.gutter).toBeGreaterThan(0); // space is reserved
  expect(rest.button).toBe("none"); // no arrows
  expect(rest.thumb).toBe("rgba(0, 0, 0, 0)"); // hidden at rest

  // Any scroll shows it: wheel, keys, or the caret. A programmatic scroll keeps the test deterministic.
  await scroller.evaluate((el) => el.scrollBy(0, 600));
  await expect.poll(async () => (await state()).scrolling).toBe(true);
  const scrolling = await state();
  expect(scrolling.thumb).not.toBe("rgba(0, 0, 0, 0)");
  expect(scrolling.contentLeft).toBe(rest.contentLeft); // nothing moved
  await page.screenshot({ path: "../../test-results/screens/scrollbar-scrolling.png" });
  await expect.poll(async () => (await state()).scrolling, { timeout: 3000 }).toBe(false);

  const box = (await scroller.boundingBox())!;
  await page.mouse.move(box.x + box.width - 3, box.y + box.height / 2);
  const hovered = await state();
  expect(hovered.hover).toBe(true);
  expect(hovered.thumb).not.toBe("rgba(0, 0, 0, 0)");
  expect(hovered.contentLeft).toBe(rest.contentLeft);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  expect((await state()).hover).toBe(false);
  await quit(l);
});
