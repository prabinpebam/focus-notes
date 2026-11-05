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
    const itemInk = body ? [...body.children].filter(visible).map(ink).filter((rows) => rows.length) : [];
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
