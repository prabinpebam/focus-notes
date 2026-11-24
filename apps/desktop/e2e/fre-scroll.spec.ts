/**
 * FRE / Welcome scroll geometry: overflowing onboarding steps (expanded More options,
 * active clone progress) must start at the top when scrolled to 0 and scroll all the way
 * to their last item with at least the page-margin token (space.marginPage) of clearance, and
 * never less than the scroller's top inset (the owner, 24 November: "We need bigger bottom
 * margin for the content on this screen, else the content is stuck to the bottom edge.").
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { test, expect, type Page } from "./fixtures.ts";
import { quit, windowBox, type Launched } from "./helpers.ts";
import { card, existingInstance, heading, start, world } from "./github-world.ts";

interface ScrollGeometry {
  windowHeight: number;
  clientHeight: number;
  scrollHeight: number;
  maxScrollTop: number;
  paddingTop: number;
  paddingBottom: number;
  marginPage: number;
  overflows: boolean;
  topClearanceAtZero: number;
  bottomClearanceAtEnd: number;
  firstItemTop: number;
  lastItemBottom: number;
  scrollerTop: number;
  scrollerBottom: number;
  lastItemText: string;
}

async function resizeDrawnWindow(l: Launched, width: number, height: number) {
  const box = await windowBox(l.page);
  if (Math.abs(box.width - width) <= 1 && Math.abs(box.height - height) <= 1) return;
  const inner = await l.page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
  const mx = (inner.w - box.width) / 2;
  const my = (inner.h - box.height) / 2;
  await l.app.evaluate(({ BrowserWindow }, a) => {
    const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes("index.html"))!;
    const b = w.getBounds();
    w.setBounds({ x: b.x, y: b.y, width: Math.round(a.width + 2 * a.mx), height: Math.round(a.height + 2 * a.my) });
  }, { width, height, mx, my });
  await expect.poll(async () => {
    const b = await windowBox(l.page);
    return Math.abs(b.width - width) <= 2 && Math.abs(b.height - height) <= 2;
  }, { timeout: 5_000 }).toBe(true);
}

async function measureFreScroll(page: Page): Promise<ScrollGeometry> {
  return page.evaluate(async () => {
    const surface = document.querySelector('[data-key-scope="firstRun"]') as HTMLElement | null;
    if (!surface) throw new Error("No firstRun surface found");
    const scroller = surface.firstElementChild as HTMLElement | null;
    if (!scroller) throw new Error("No firstRun scroller found");
    const content = scroller.firstElementChild as HTMLElement | null;
    if (!content) throw new Error("No firstRun Center content found");

    const cs = getComputedStyle(scroller);
    const paddingTop = parseFloat(cs.paddingTop);
    const paddingBottom = parseFloat(cs.paddingBottom);
    const probe = document.createElement("div");
    probe.style.paddingTop = "var(--fn-space-margin-page)";
    document.body.append(probe);
    const marginPage = parseFloat(getComputedStyle(probe).paddingTop);
    probe.remove();
    if (!(marginPage > 0)) throw new Error("space.marginPage did not resolve");

    const visibleLeaves = () => {
      const els = [...content.querySelectorAll("h1, h2, p, button, span, [role='progressbar'], [data-app-mark], [data-visual-anchor], svg")];
      return els
        .map((el) => ({ el: el as HTMLElement, r: el.getBoundingClientRect() }))
        .filter(({ el, r }) => r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden");
    };

    // Scroll to top and measure top-most item.
    scroller.scrollTop = 0;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const srTop = scroller.getBoundingClientRect();
    const topLeaves = visibleLeaves();
    const first = topLeaves.reduce((a, b) => (b.r.top < a.r.top ? b : a));
    const topClearanceAtZero = first.r.top - srTop.top;

    // Scroll to bottom and measure bottom-most item.
    scroller.scrollTop = scroller.scrollHeight;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const srEnd = scroller.getBoundingClientRect();
    const endLeaves = visibleLeaves();
    const last = endLeaves.reduce((a, b) => (b.r.bottom > a.r.bottom ? b : a));
    const bottomClearanceAtEnd = srEnd.bottom - last.r.bottom;

    return {
      windowHeight: window.innerHeight,
      clientHeight: scroller.clientHeight,
      scrollHeight: scroller.scrollHeight,
      maxScrollTop: scroller.scrollTop,
      paddingTop,
      paddingBottom,
      marginPage,
      overflows: scroller.scrollHeight > scroller.clientHeight,
      topClearanceAtZero: Math.round(topClearanceAtZero * 10) / 10,
      bottomClearanceAtEnd: Math.round(bottomClearanceAtEnd * 10) / 10,
      firstItemTop: Math.round(first.r.top * 10) / 10,
      lastItemBottom: Math.round(last.r.bottom * 10) / 10,
      scrollerTop: Math.round(srEnd.top * 10) / 10,
      scrollerBottom: Math.round(srEnd.bottom * 10) / 10,
      lastItemText: (last.el.innerText || last.el.getAttribute("aria-label") || last.el.tagName).trim().slice(0, 60),
    };
  });
}

test("FRE We found your notes: expanded More options and clone progress scroll to the end with at least the page margin below the last item", async () => {
  test.setTimeout(120_000);
  const w = await world({ gcm: true });
  existingInstance(w);
  const day = 86_400_000;
  w.gh.add({ owner: "ada", name: "journal", private: true, files: [".focus-notes/workspace.json"] }).pushedAt = new Date(Date.now() - 2 * 3_600_000).toISOString();
  w.gh.add({ owner: "ada", name: "work-notes", files: [".focus-notes/workspace.json"] }).pushedAt = new Date(Date.now() - 45 * day).toISOString();
  w.fakes.store(w.gh.token);

  const l = await start(w);
  const { page } = l;
  try {
    // Small (below breakpoint.short = 560), about 720 tall, the default and a large window.
    const sizes = [
      ["720x480", 720, 480],
      ["960x720", 960, 720],
      ["1100x780", 1100, 780],
      ["1440x1000", 1440, 1000],
    ] as const;
    const check = async (step: string) => {
      for (const [size, width, height] of sizes) {
        await resizeDrawnWindow(l, width, height);
        const m = await measureFreScroll(page);
        const label = `${step} ${size}`;
        process.stdout.write(`[fre-scroll] ${label}: ${JSON.stringify(m)}\n`);
        expect(m.topClearanceAtZero, `${label}: top item reachable at scrollTop 0`).toBeGreaterThanOrEqual(m.paddingTop - 1);
        expect(m.bottomClearanceAtEnd, `${label}: last item has >= space.marginPage (${m.marginPage}px) below it`).toBeGreaterThanOrEqual(m.marginPage - 1);
        expect(m.bottomClearanceAtEnd, `${label}: no less space below the last item than the scroller's top inset`).toBeGreaterThanOrEqual(m.paddingTop - 1);
      }
    };

    await heading(page, "A quiet place to write");
    await check("welcome");
    await card(page).getByRole("button", { name: "Get started" }).click();
    await expect(card(page).getByRole("button", { name: "Continue as Ada" })).toBeVisible({ timeout: 20_000 });
    await check("sign-in");
    await card(page).getByRole("button", { name: "Continue as Ada" }).click();
    await heading(page, "We found your notes");
    await expect(card(page).getByRole("button", { name: "Open", exact: true }).first()).toBeVisible({ timeout: 15_000 });
    await check("found");

    // Expanded "More options": overflows in the small window.
    await card(page).getByRole("button", { name: "More options" }).click();
    await expect(card(page).getByRole("button", { name: "Open from GitHub…" })).toBeVisible();
    await check("more-options");
    await resizeDrawnWindow(l, 720, 480);
    expect((await measureFreScroll(page)).overflows, "more-options 720x480 scrolls").toBe(true);

    // Expanded progress ("Getting the private notes", the bar, Cancel, the checklist ending in "Link them").
    await resizeDrawnWindow(l, 960, 660);
    await l.app.evaluate(() => {
      (globalThis as { focusNotesSlow?: Record<string, number> }).focusNotesSlow = { "firstRun:clone": 25_000 };
    });
    await card(page).getByRole("button", { name: "Open", exact: true }).first().click();
    await expect(card(page).getByRole("button", { name: "Cancel" })).toBeVisible({ timeout: 15_000 });
    await expect(card(page).getByText(/Download to this computer/i)).toBeVisible({ timeout: 15_000 });
    await check("progress");
    await resizeDrawnWindow(l, 720, 480);
    expect((await measureFreScroll(page)).overflows, "progress 720x480 scrolls").toBe(true);

    await l.app.evaluate(() => {
      delete (globalThis as { focusNotesSlow?: Record<string, number> }).focusNotesSlow;
    });
  } finally {
    try {
      await quit(l);
    } finally {
      if (process.platform === "win32") {
        execFileSync("pwsh", ["-File", join(import.meta.dirname, "..", "..", "..", "tools", "dev", "close-test-apps.ps1"), "-OnlyPid", String(l.pid)], { stdio: "inherit" });
      }
      w.server.close();
    }
  }
});
