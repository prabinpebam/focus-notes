/**
 * Settings groups by space (the spacing skill, rules 2 and 3; spacing-audit.md SP-12): in every tab,
 * measured in the built app on what the eye sees (a control's border box, a text's glyph box, not its
 * line box), three levels of space read apart:
 *   - pair: inside one item (a control and its description, a status and its detail);
 *   - item: between the items of one section;
 *   - section: between sections, above each heading.
 * Each level is at least 1.5 × the one inside it, every heading sits in a Section's header, and a
 * heading is nearer its own content than the content above. The measured rows are written to
 * `test-results/settings-grouping/<tab>.json` and logged, so a change shows its numbers.
 */
import { test, expect, type Locator } from "./fixtures.ts";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { launch, quit, tempDirs } from "./helpers.ts";
import { configureSharing, instance } from "./instance.ts";
import { moreMenu, reset, spotlight } from "./surfaces.ts";
import { journeyUnseen } from "../src/main/window/journey-window.ts";

const mod = process.platform === "darwin" ? "Meta" : "Control";
const OUT = resolve("../../test-results/settings-grouping");
/** Each level clearly larger than the one inside it. */
const RATIO = 1.5;

type Row = { top: number; bottom: number; label: string };
type Measured = {
  rows: { label: string; gapAfter: number | null }[];
  loose: string[];
  sections: { heading: string; headingGap: number | null; items: { label: string; inner: number[]; gapAfter: number | null }[]; gapAfter: number | null }[];
};

/** Measures one tab panel in the page: every visible row, and each Section's levels. */
function measure(panel: Element): Measured {
  const CONTROL = 'button, a[href], input, textarea, select, [role="radiogroup"], [role="switch"], [role="slider"], [role="combobox"], [role="tablist"]';
  const visible = (e: Element) => {
    const r = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    return cs.visibility !== "hidden" && cs.opacity !== "0" && cs.clipPath !== "inset(50%)" &&
      (cs.display === "contents" || (r.width > 1 && r.height > 1));
  };
  const enclosed = (e: Element) => {
    const cs = getComputedStyle(e);
    return parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderBottomWidth) > 0 || (cs.backgroundColor !== "rgba(0, 0, 0, 0)" && cs.backgroundColor !== "transparent");
  };
  // Text as the eye sees it (spacing rule 7, `text-box: trim-both cap alphabetic`): from the first
  // line's cap height to the last line's baseline. A range's rect is the font's content area, so its
  // top is the baseline less the font's ascent.
  const ctx = document.createElement("canvas").getContext("2d")!;
  const metrics = new Map<string, { ascent: number; cap: number }>();
  const fontOf = (e: Element) => {
    const cs = getComputedStyle(e);
    const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    if (!metrics.has(font)) {
      ctx.font = font;
      const m = ctx.measureText("H");
      metrics.set(font, { ascent: m.fontBoundingBoxAscent, cap: m.actualBoundingBoxAscent });
    }
    return metrics.get(font)!;
  };
  // What the eye sees: a control or an enclosure is its border box; text is cap height to baseline.
  const ink = (root: Element): Row[] => {
    const out: Row[] = [];
    const visit = (e: Element) => {
      if (!visible(e)) return;
      if (getComputedStyle(e).display !== "contents" && (e.matches(CONTROL) || (e !== root && enclosed(e)))) {
        const r = e.getBoundingClientRect();
        out.push({ top: r.top, bottom: r.bottom, label: (e.getAttribute("aria-label") || (e as HTMLElement).innerText || e.tagName).trim().split("\n")[0]!.slice(0, 40) });
        return;
      }
      for (const n of e.childNodes) {
        if (n.nodeType === Node.TEXT_NODE && n.textContent?.trim()) {
          const range = document.createRange();
          range.selectNodeContents(n);
          const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
          if (rects.length) {
            const f = fontOf(e);
            const first = Math.min(...rects.map((r) => r.top)), last = Math.max(...rects.map((r) => r.top));
            out.push({ top: first + f.ascent - f.cap, bottom: last + f.ascent, label: n.textContent.trim().slice(0, 40) });
          }
        } else if (n.nodeType === Node.ELEMENT_NODE) visit(n as Element);
      }
    };
    visit(root);
    // Boxes side by side (buttons in a row) are one row.
    const rows: Row[] = [];
    for (const b of out.sort((a, c) => a.top - c.top)) {
      const last = rows.at(-1);
      if (last && b.top < last.bottom - 1) { last.bottom = Math.max(last.bottom, b.bottom); continue; }
      rows.push({ ...b });
    }
    return rows;
  };
  const gap = (a: Row[] | undefined, b: Row[] | undefined) => (a?.length && b?.length ? Math.round((b[0]!.top - a.at(-1)!.bottom) * 10) / 10 : null);
  const all = ink(panel);
  const rows = all.map((r, i) => ({ label: r.label, gapAfter: i < all.length - 1 ? Math.round((all[i + 1]!.top - r.bottom) * 10) / 10 : null }));
  // Headings outside a Section's header: a flat list where a heading is spaced like any item.
  const loose = [...panel.querySelectorAll("h1, h2, h3, h4, h5, h6")].filter((h) => visible(h) && !h.closest("[data-section-header]")).map((h) => (h as HTMLElement).innerText);
  const sectionEls = [...panel.querySelectorAll("[data-section]")].filter((s) => visible(s) && !s.parentElement?.closest("[data-section]"));
  const sectionInk = sectionEls.map((s) => ink(s));
  const sections = sectionEls.map((s, i) => {
    const header = s.querySelector(":scope > [data-section-header]");
    const body = s.querySelector(":scope > [data-section-body]");
    // An item that is itself an enclosure (a card) is its border box, as it is at the section level.
    const itemInk = body ? [...body.children].filter(visible).map((c) => {
      if (getComputedStyle(c).display === "contents" || !enclosed(c)) return ink(c);
      const r = c.getBoundingClientRect();
      return [{ top: r.top, bottom: r.bottom, label: ((c as HTMLElement).innerText || c.tagName).trim().split("\n")[0]!.slice(0, 40) }];
    }).filter((rows) => rows.length) : [];
    return {
      heading: header ? (header as HTMLElement).innerText.split("\n")[0]! : "",
      headingGap: header ? gap(ink(header), itemInk[0]) : null,
      items: itemInk.map((rows, j) => ({
        label: rows[0]!.label,
        inner: (itemInk[j] ?? []).slice(1).map((r, k) => Math.round((r.top - itemInk[j]![k]!.bottom) * 10) / 10),
        gapAfter: j < itemInk.length - 1 ? gap(itemInk[j], itemInk[j + 1]) : null,
      })),
      gapAfter: i < sectionEls.length - 1 ? gap(sectionInk[i], sectionInk[i + 1]) : null,
    };
  });
  return { rows, loose, sections };
}

/** The problems in one tab's measurements: a level not clearly apart from the one inside it. */
function problems(tab: string, m: Measured): string[] {
  const out: string[] = [];
  if (m.loose.length) out.push(`${tab}: heading outside a Section, spaced like an item: ${m.loose.join(", ")}`);
  const max = (xs: number[]) => (xs.length ? Math.max(...xs) : 0);
  m.sections.forEach((s, index) => {
    const where = `${tab} / ${s.heading || `section ${index + 1}`}`;
    s.items.forEach((item, i) => {
      if (item.gapAfter === null) return;
      const inner = max([...item.inner, ...(s.items[i + 1]?.inner ?? [])]);
      if (item.gapAfter < RATIO * inner)
        out.push(`${where}: ${item.label} → ${s.items[i + 1]?.label}: items ${item.gapAfter} px apart, but ${inner} px inside a neighbour (want ≥ ${RATIO} ×)`);
      if (s.headingGap !== null && s.headingGap > item.gapAfter)
        out.push(`${where}: heading ${s.headingGap} px from its content, further than its items (${item.gapAfter} px)`);
    });
    const next = m.sections[index + 1];
    if (s.gapAfter === null || !next) return;
    const inside = max([s, next].flatMap((section) => section.items.flatMap((item) => [...item.inner, ...(item.gapAfter === null ? [] : [item.gapAfter])])));
    if (s.gapAfter < RATIO * inside)
      out.push(`${where}: sections ${s.gapAfter} px apart, but ${inside} px inside a neighbour (want ≥ ${RATIO} ×)`);
    if (next.headingGap !== null && s.gapAfter < 2 * next.headingGap)
      out.push(`${where}: ${s.gapAfter} px above the next heading, ${next.headingGap} px below it (want ≥ 2 ×)`);
  });
  return out;
}

test("Settings: every tab groups by space, pair < item < section", async () => {
  test.setTimeout(120_000);
  const dirs = tempDirs();
  writeFileSync(join(dirs.docs, "Welcome.md"), "# Welcome\n\nA note.\n");
  const l = await launch(dirs);
  try {
    const { page } = l;
    await expect(page.getByRole("textbox", { name: "Note" })).toBeFocused({ timeout: 15_000 });
    await page.keyboard.press(`${mod}+,`);
    const dialog = page.getByRole("dialog", { name: "Settings" });
    await expect(dialog).toBeVisible();
    const tabs = await dialog.getByRole("tab").allInnerTexts();
    expect(tabs.length).toBeGreaterThan(3);
    mkdirSync(OUT, { recursive: true });
    const found: string[] = [];
    for (const name of tabs.map((t) => t.trim()).filter(Boolean)) {
      const tab = dialog.getByRole("tab", { name, exact: true });
      await tab.click();
      await expect(tab).toHaveAttribute("aria-selected", "true");
      const panel: Locator = dialog.getByRole("tabpanel");
      await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
      await page.evaluate(() => document.fonts.ready);
      const m = await panel.evaluate(measure);
      writeFileSync(join(OUT, `${name.toLowerCase().replace(/\W+/g, "-")}.json`), JSON.stringify(m, null, 1));
      console.log(`[grouping] ${name}: ${m.rows.map((r) => `${r.label}${r.gapAfter === null ? "" : ` ⟶${r.gapAfter}`}`).join(" | ")}`);
      found.push(...problems(name, m));
    }
    expect(found, "Settings groups by space (documentations/design/spacing-audit.md, SP-12)").toEqual([]);
  } finally {
    await quit(l);
  }
});

/** Includes field focus shadows as well as outlines: the Name field uses a one-pixel outer shadow. */
function clippedFocus(el: Element): string[] {
  const out: string[] = [];
  for (let ring: Element | null = el; ring && !ring.matches('[data-surface="dialog"], [data-surface="sheet"]'); ring = ring.parentElement) {
    const style = getComputedStyle(ring);
    const box = ring.getBoundingClientRect();
    if (style.clipPath === "inset(50%)" || style.opacity === "0" || box.width <= 1 || box.height <= 1) continue;
    let hidden = false;
    for (let parent = ring.parentElement; parent; parent = parent.parentElement) {
      const cs = getComputedStyle(parent);
      if (cs.clip === "rect(0px, 0px, 0px, 0px)" || cs.clipPath === "inset(50%)" || cs.opacity === "0") { hidden = true; break; }
    }
    if (hidden) continue;
    let reach = style.outlineStyle === "none" ? 0 : Math.max(0, parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset));
    for (const shadow of style.boxShadow.matchAll(/((?:-?\d*\.?\d+px\s*){2,4})(inset)?/g)) {
      if (shadow[2]) continue;
      const [x = 0, y = 0, blur = 0, spread = 0] = shadow[1]!.match(/-?\d*\.?\d+/g)!.map(Number);
      // Fields use an unblurred spread for focus; a segment's resting elevation is not a focus ring.
      if (x === 0 && y === 0 && blur === 0) reach = Math.max(reach, spread);
    }
    if (reach <= 0) continue;
    for (let clip = ring.parentElement; clip; clip = clip.parentElement) {
      const cs = getComputedStyle(clip), r = clip.getBoundingClientRect();
      const x = /auto|scroll|hidden|clip/.test(cs.overflowX), y = /auto|scroll|hidden|clip/.test(cs.overflowY);
      const left = r.left + clip.clientLeft, top = r.top + clip.clientTop;
      if (x && (box.left - reach < left - 0.5 || box.right + reach > left + clip.clientWidth + 0.5) ||
          y && (box.top - reach < top - 0.5 || box.bottom + reach > top + clip.clientHeight + 0.5)) {
        out.push(`${el.getAttribute("aria-label") || el.id || el.tagName}: ${reach}px focus ring on ${ring.tagName} (${Math.round(box.width)}x${Math.round(box.height)}) clipped by ${clip.getAttribute("role") || clip.outerHTML.split(">")[0]} (${clip.clientWidth}x${clip.clientHeight}): left ${Math.round(box.left - reach - left)}, right ${Math.round(left + clip.clientWidth - box.right - reach)}, top ${Math.round(box.top - reach - top)}, bottom ${Math.round(top + clip.clientHeight - box.bottom - reach)}`);
      }
    }
  }
  return out;
}

async function checkRings(scope: Locator): Promise<string[]> {
  const problems: string[] = [];
  await scope.page().keyboard.press("Tab");
  for (const control of await scope.locator('a[href], button, input, select, textarea, [tabindex], [contenteditable="true"]').all()) {
    if (!await control.evaluate(el => el instanceof HTMLElement && el.tabIndex >= 0 && !el.matches(":disabled") &&
      el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden")) continue;
    await control.scrollIntoViewIfNeeded();
    await control.focus();
    await scope.page().evaluate(() => new Promise(requestAnimationFrame));
    problems.push(...await control.evaluate(clippedFocus));
  }
  return problems;
}

test("SP-14: menu scroll frames, full-bleed results and navigation insets preserve grouping", async () => {
  test.setTimeout(120_000);
  const l = await launch(tempDirs());
  try {
    for (const compact of [false, true]) {
      if (compact) await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(480, 360));
      await moreMenu(l.page);
      const menu = l.page.getByRole("menu", { name: "More", exact: true });
      expect(await menu.evaluate(el => {
        const content = getComputedStyle(el), frame = getComputedStyle(el.parentElement!);
        return { inset: parseFloat(content.paddingTop), frameInset: parseFloat(frame.paddingTop), scrolls: frame.overflowY };
      })).toEqual({ inset: 8, frameInset: 0, scrolls: "auto" });
      for (const key of ["End", "Home"]) {
        await l.page.keyboard.press(key);
        const focused = menu.locator('[data-focus-visible]');
        await expect(focused).toHaveCount(1);
        expect(await focused.evaluate(clippedFocus)).toEqual([]);
      }
      await reset(l.page);
      await spotlight(l.page, `${mod}+p`);
      const results = l.page.getByRole("dialog", { name: "Actions", exact: true }).getByRole("listbox");
      expect(await results.evaluate(el => {
        const cs = getComputedStyle(el), parent = el.parentElement!, box = el.getBoundingClientRect(), region = parent.getBoundingClientRect();
        return {
          marginStart: parseFloat(cs.marginInlineStart), marginEnd: parseFloat(cs.marginInlineEnd),
          tracks: getComputedStyle(parent).display, column: cs.gridColumn,
          start: Math.round(box.left - region.left), end: Math.round(region.right - box.right),
        };
      })).toEqual({ marginStart: 0, marginEnd: 0, tracks: "grid", column: "full", start: 0, end: 0 });
      await reset(l.page);
      await l.page.keyboard.press(`${mod}+,`);
      const settings = l.page.getByRole("dialog", { name: "Settings", exact: true });
      await settings.getByRole("tab", { name: "Appearance", exact: true }).click();
      expect(await settings.getByRole("tablist").evaluate(el => {
        const navigation = el.closest("[data-side-nav]")!;
        const content = getComputedStyle(navigation.hasAttribute("data-tab-navigation") ? el : navigation);
        return Math.min(parseFloat(content.paddingTop), parseFloat(content.paddingBottom)) >= parseFloat(getComputedStyle(el).rowGap);
      })).toBe(true);
      await reset(l.page);
    }
  } finally {
    await quit(l);
  }
});

test("Settings: the scroll panel reaches the dialog edges and never clips a field's focus ring", async () => {
  test.setTimeout(120_000);
  const l = await launch(tempDirs());
  try {
    await expect(l.page.getByRole("textbox", { name: "Note" })).toBeFocused();
    await l.page.keyboard.press(`${mod}+,`);
    const dialog = l.page.getByRole("dialog", { name: "Settings" });
    const problems: string[] = [];
    for (const compact of [false, true]) {
      if (compact) expect(await l.app.evaluate(({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows()[0]!;
        window.setSize(480, 360);
        return window.getSize();
      })).toEqual([480, 360]);
      await dialog.getByRole("tab", { name: "Project", exact: true }).click();
      const name = dialog.getByRole("textbox", { name: "Name", exact: true });
      await name.focus();
      await expect(name).toBeFocused();
      problems.push(...await name.evaluate(clippedFocus));
      const edges = await dialog.evaluate(el => {
        const panel = el.querySelector('[role="tabpanel"]')!;
        const box = el.getBoundingClientRect(), scroll = panel.getBoundingClientRect(), cs = getComputedStyle(el);
        return { right: box.right - parseFloat(cs.borderRightWidth) - scroll.right, bottom: box.bottom - parseFloat(cs.borderBottomWidth) - scroll.bottom };
      });
      if (Math.abs(edges.right) > 0.5) problems.push(`scrollbar is ${edges.right}px inside the dialog edge`);
      if (Math.abs(edges.bottom) > 0.5) problems.push(`scroll panel ends ${edges.bottom}px above the dialog bottom`);
      for (const tab of await dialog.getByRole("tab").all()) {
        await tab.click();
        problems.push(...await checkRings(dialog));
      }
    }
    expect(problems).toEqual([]);
  } finally {
    await quit(l);
  }
});

test("Open, Share and Files keep scrollbars at their surface edges and focus rings inside their clips", async () => {
  test.setTimeout(120_000);
  const { dirs } = instance();
  await configureSharing(dirs);
  writeFileSync(join(dirs.userData, "state.json"), JSON.stringify({
    version: 1, firstRun: "done", projectIntroSeen: true, lastNotePath: join(dirs.docs, "private", "notes", "welcome.md"),
  }));
  const l = await launch(dirs);
  const problems: string[] = [];
  expect(await l.app.evaluate(({ BrowserWindow }, opacity) => BrowserWindow.getAllWindows().every(w => w.getOpacity() === opacity), journeyUnseen({ ...process.env, FOCUS_NOTES_E2E: "1" }) ? 0 : 1)).toBe(true);
  const inspect = async (surface: Locator, body: string) => {
    await expect(surface).toBeVisible();
    await l.page.waitForFunction(() => document.getAnimations().every(a => a.playState !== "running"));
    problems.push(...await checkRings(surface));
    problems.push(...await surface.evaluate((el, selector) => {
      const scroller = el.querySelector(selector);
      if (!scroller) return [`${el.getAttribute("aria-label")}: missing scroll region`];
      const box = el.getBoundingClientRect(), scroll = scroller.getBoundingClientRect(), cs = getComputedStyle(el);
      const right = box.right - parseFloat(cs.borderRightWidth) - scroll.right;
      const footer = el.querySelector("[data-sheet-footer]");
      const end = footer?.getBoundingClientRect().bottom ?? scroll.bottom;
      const bottom = box.bottom - parseFloat(cs.borderBottomWidth) - end;
      return [
        ...(Math.abs(right) > 0.5 ? [`${el.getAttribute("aria-label")}: scrollbar ${right}px from inner edge`] : []),
        ...(Math.abs(bottom) > 0.5 ? [`${el.getAttribute("aria-label")}: content/footer ${bottom}px from bottom edge`] : []),
      ];
    }, body));
  };
  try {
    await expect(l.page.getByRole("textbox", { name: "Note", exact: true })).toContainText("First line.");
    await l.page.keyboard.press(`${mod}+Alt+o`);
    const open = l.page.getByRole("dialog", { name: "Open", exact: true });
    await inspect(open, "[data-dialog-body]");
    // The focus audit leaves a Pin tooltip owning Escape; close its dialog explicitly.
    await open.getByRole("button", { name: "Close", exact: true }).click();
    await expect(open).toBeHidden();
    await expect(l.page.locator("[data-scrim]")).toHaveCount(0);
    await l.page.keyboard.press(`${mod}+.`);
    await l.page.getByRole("toolbar", { name: "Toolbar", exact: true }).getByRole("button", { name: "More", exact: true }).click();
    await l.page.getByRole("menuitem", { name: "Share…", exact: true }).click();
    const share = l.page.getByRole("dialog", { name: "Share “Welcome”", exact: true });
    await inspect(share, "[data-dialog-body]");
    await share.getByRole("button", { name: "Close", exact: true }).click();
    await expect(share).toBeHidden();
    await expect(l.page.locator("[data-scrim]")).toHaveCount(0);
    await l.page.keyboard.press(`${mod}+o`);
    const files = l.page.getByRole("complementary", { name: "Files", exact: true });
    await inspect(files, "[data-sheet-body]");
    await l.page.keyboard.press("Escape");
    await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1024, 720));
    await l.page.keyboard.press(`${mod}+Alt+p`);
    await expect(files).toHaveAttribute("data-docked", "");
    await inspect(files, "[data-sheet-body]");
    await l.page.keyboard.press(`${mod}+Alt+p`);
    await expect(files).not.toHaveAttribute("data-pinned", "");
    await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(480, 360));
    await expect(files).toHaveAttribute("data-short", "");
    await inspect(files, "[data-sheet-main]");
    expect(problems).toEqual([]);
  } finally {
    await quit(l);
  }
});
