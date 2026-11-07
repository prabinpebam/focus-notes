/**
 * The spacing audit (the spacing skill's audit procedure) on every surface of the built app: the
 * probe's `analyze` on each, `perturb` + `compare` (a child appended at run time moves nothing), and
 * forced :hover, :focus-visible and :active on one control of each kind (states move nothing), in
 * light and dark, at the default and the minimum window. Writes the findings to
 * `SPACING_AUDIT_OUT` (JSON) and fails on any S1 or S2 outside the named exclusions. The full audit
 * is opt-in (`SPACING_AUDIT=1`); without it, the main surfaces run light at the default size (CORE).
 */
import { test, expect, type Page } from "./fixtures.ts";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { launch, quit, tempDirs } from "./helpers.ts";
import { settled } from "./visual-quality.ts";
import { LONG_NOTE, SIZES, SURFACES, mod, moreMenu, reset, scheme } from "./surfaces.ts";
import type { Launched } from "./helpers.ts";

/** surfaces.ts's start, opened on the long note (with notes present, the app now opens the Open view). */
async function start(size?: { width: number; height: number }): Promise<Launched> {
  const dirs = tempDirs();
  const note = join(dirs.docs, "Welcome.md");
  writeFileSync(note, LONG_NOTE);
  for (let i = 1; i <= 24; i++) writeFileSync(join(dirs.docs, `Idea ${String(i).padStart(2, "0")}.md`), `# Idea ${i}\n\nA thought.\n`);
  mkdirSync(join(dirs.docs, "Projects"));
  writeFileSync(join(dirs.docs, "Projects", "plan.md"), "# Plan\n\n## Steps\n\nFirst.\n\n## Later\n\nThen.\n");
  writeFileSync(join(dirs.userData, "state.json"), JSON.stringify({ version: 1, firstRun: "done", lastNotePath: note }));
  if (size) writeFileSync(join(dirs.userData, "window.json"), JSON.stringify({ version: 1, bounds: { x: 40, y: 40, ...size } }));
  const l = await launch(dirs);
  await expect(l.page.getByRole("textbox", { name: "Note" })).toBeFocused({ timeout: 15_000 });
  await l.page.keyboard.press("F8");
  await expect.poll(() => l.page.evaluate(() => document.documentElement.dataset.focus)).toBeUndefined();
  return l;
}

const ON = process.env.SPACING_AUDIT === "1";
/**
 * Without SPACING_AUDIT, one fast pass still runs and fails on any S1 or S2: the main surfaces, light,
 * at the default size (spacing-audit.md, "Tests to add"). The full audit enforces the same on every surface.
 */
const CORE = ["canvas", "trigger toolbar", "more menu", "find and replace", "cheat sheet", "files", "spotlight", "spotlight commands", "settings appearance", "slash menu"];
const OUT = process.env.SPACING_AUDIT_OUT ?? resolve("../../test-results/spacing-audit");
const PROBE = process.env.SPACING_PROBE ?? resolve("../../agentic-craft/tools/spacing-probe.mjs");
const ROOT = process.env.SPACING_ROOT ?? "body";
// Markup the system didn't write follows the prose rules, not the component rules.
const IGNORE = '[data-editor], [class*="prose"]';

/**
 * What the probe measures but the rules don't mean, each by name with its reason (spacing-audit.md,
 * "Not fixed, and why"). Anything else at S1 or S2 fails the journey.
 */
// Parts are named by a selector, never a class name: a production build (CI) hashes class names.
const EXCLUDED: { rule: RegExp; path?: RegExp; sel?: string; where?: RegExp; why: string }[] = [
  { rule: /^below-target$/, sel: "[data-project-pill], [data-zone], [data-open-item] button[title]", why: "the written dense-surface list: at least 24 px (size.hitMin)" },
  { rule: /^(moved|spacing-changed)$/, sel: "[data-editor-scroller] > div", why: "the note re-renders or scrolls under a forced state: prose" },
  { rule: /^(moved|spacing-changed)$/, path: /^document$/, why: "the count of what an origin pushed" },
  { rule: /./, where: /Customize toolbar/, why: "OPEN for vq-toolbar-design: ToolbarComposer is redesigned there" },
  { rule: /^group-separation$/, sel: '[role="menu"]', why: "a section's runs (checkable and plain items) are one group, split only for selection" },
  { rule: /^overlap$/, path: /> svg > /, why: "an SVG's shapes overlap by design (a step mark's art)" },
];
/** Surfaces the harness can't open yet, each with its reason (spacing-audit.md, "Not fixed, and why"). */
const UNREACHED: { where: RegExp; why: string }[] = [
  { where: /^files selection /, why: "surfaces.ts's selection helper is stale on this branch" },
  { where: /^more › Publish… /, why: "its ⋯ item opens no surface without a signed-in account" },
];
/** The probe's paths of the elements each selector-named exclusion matched, gathered as each surface is measured. */
const MATCHED = EXCLUDED.map(() => new Set<string>());
const blocking = (out: (Finding & { where: string })[]) =>
  out.filter((x) => (x.severity === "S1" || x.severity === "S2") && !EXCLUDED.some((e, i) => e.rule.test(x.rule) && (!e.path || e.path.test(x.path)) && (!e.sel || MATCHED[i]!.has(x.path)) && (!e.where || e.where.test(x.where))));
/** Records the probe path of every element the selector-named exclusions match in a snapshot. */
async function matchExcluded(page: Page, snapshot: unknown) {
  const ids = await page.evaluate((sels) => sels.map((sel) => sel ? [...document.querySelectorAll(sel)].map((e) => e.getAttribute("data-spacing-id")).filter((v): v is string => Boolean(v)) : []), EXCLUDED.map((e) => e.sel ?? ""));
  const byId = new Map((snapshot as { elements: { id: string; path: string }[] }).elements.map((e) => [e.id, e.path]));
  ids.forEach((list, i) => { for (const id of list) { const p = byId.get(id); if (p) MATCHED[i]!.add(p); } });
}
const enforce = (out: (Finding & { where: string })[]) => {
  // A surface that didn't open wasn't checked: that fails too, unless it's named here with its reason.
  const unreached = out.filter((x) => x.rule === "not-reached" && !UNREACHED.some((u) => u.where.test(x.where)));
  expect(unreached.map((x) => `${x.where}: ${x.measured}`), "every surface opened").toEqual([]);
  const b = blocking(out);
  expect(b.map((x) => `${x.severity} ${x.rule} | ${x.where} | ${x.measured} | ${x.path.split(" > ").slice(-2).join(" > ")}`), "no S1 or S2 spacing findings (documentations/design/spacing-audit.md)").toEqual([]);
};

type Finding = { severity: string; rule: string; path: string; measured: string; expected: string; fix: string };
type Probe = {
  collect: (o: unknown) => unknown;
  perturb: (o: unknown) => void;
  unperturb: () => void;
  analyze: (s: unknown, o: unknown) => Finding[];
  compare: (a: unknown, b: unknown, o: unknown) => Finding[];
  mirror: (a: unknown, b: unknown, o?: unknown) => Finding[];
};

/**
 * Waits until geometry has settled before a snapshot: no finite animation or transition running or
 * pending, and every element's box (and the page's scroll size) unchanged over 2 consecutive frames.
 * A fade that starts a frame after the surface opens (the table handles hiding under a menu) is
 * otherwise measured mid-flight and reads as a clip. Infinite animations (a spinner) and what they move
 * don't count. Gives up after `timeout` and measures what's there; the state checks stay per frame.
 */
async function geometrySettled(page: Page, timeout = 3000) {
  await settled(page);
  const ok = await page.evaluate((limit) => new Promise<boolean>((done) => {
    const t0 = performance.now();
    const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
    const snap = () => {
      const moving = new Set<Element>();
      for (const a of document.getAnimations()) {
        const target = (a.effect as KeyframeEffect | null)?.target ?? null;
        if (a.effect?.getTiming().iterations === Infinity) { if (target) moving.add(target); continue; }
        if (a.playState === "running" || a.pending) return null;
      }
      const parts = [document.documentElement.scrollWidth, document.documentElement.scrollHeight];
      for (const e of document.body.querySelectorAll("*")) {
        if ([...moving].some((m) => m.contains(e))) continue;
        const r = e.getBoundingClientRect();
        parts.push(Math.round(r.x * 2), Math.round(r.y * 2), Math.round(r.width * 2), Math.round(r.height * 2));
      }
      return parts.join(",");
    };
    void (async () => {
      let prev: string | null = null;
      let same = 0;
      while (performance.now() - t0 < limit) {
        await frame();
        const s = snap();
        same = s !== null && s === prev ? same + 1 : 0;
        if (same >= 2) return done(true);
        prev = s;
      }
      done(false);
    })();
  }), timeout);
  if (!ok) console.log(`[spacing] geometry still moving after ${timeout} ms; measured as is`);
}

async function audit(page: Page, p: Probe, where: string, out: (Finding & { where: string; check: string })[], states = true) {
  const t0 = Date.now();
  await geometrySettled(page);
  await page.evaluate(() => document.fonts.ready);
  const base = await page.evaluate(p.collect, { root: ROOT, ignore: IGNORE });
  await matchExcluded(page, base);
  // The probe exempts prose (`ignore`) and skips visually hidden wrappers; this also drops any finding on a 1 px box.
  type Box = { path: string; ignored: boolean; rect: { w: number; h: number } };
  const skip = new Set((base as { elements: Box[] }).elements.filter((e) => e.ignored || (e.rect.w <= 1 && e.rect.h <= 1)).map((e) => e.path));
  const from = out.length;
  for (const f of p.analyze(base, { base: 4, allow: [1, 2], target: 32 })) out.push({ ...f, where, check: "analyze" });
  // States: one control of each kind, forced through the developer protocol (no pointer, no keys).
  if (states) {
    const cdp = await page.context().newCDPSession(page);
    try {
      await cdp.send("DOM.enable");
      await cdp.send("CSS.enable");
      const { root } = await cdp.send("DOM.getDocument", { depth: -1 });
      const seen = new Set<string>();
      const els = (base as { elements: { id: string; path: string; interactive: boolean }[] }).elements;
      for (const t of els.filter((e) => e.interactive)) {
        const kind = t.path.split(" > ").pop()!.replace(/#[\w-]+/, "").replace(/__[\w]+/g, "");
        if (seen.has(kind) || seen.size >= 8) continue;
        seen.add(kind);
        const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: `[data-spacing-id="${t.id}"]` });
        if (!nodeId) continue;
        for (const forced of [["hover"], ["focus", "focus-visible"], ["active"]]) {
          await cdp.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: forced });
          const s = await page.evaluate(p.collect, { root: ROOT, ignore: IGNORE });
          for (const f of p.compare(base, s, { cause: `:${forced.at(-1)} on ${kind}` })) out.push({ ...f, where, check: `state :${forced.at(-1)}` });
          await cdp.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: [] });
        }
      }
    } finally {
      await cdp.detach().catch(() => {});
    }
  }
  // A child appended to every container (a tooltip, a portal, a live region) moves nothing.
  await page.evaluate(p.perturb, { root: ROOT });
  const perturbed = await page.evaluate(p.collect, { root: ROOT, ignore: IGNORE });
  for (const f of p.compare(base, perturbed, { cause: "a child added to every container" })) out.push({ ...f, where, check: "perturb" });
  await page.evaluate(p.unperturb);
  // Right to left: insets swap sides.
  const ltr = await page.evaluate(p.collect, { root: ROOT, ignore: IGNORE });
  await page.evaluate(() => { document.documentElement.dir = "rtl"; });
  const rtl = await page.evaluate(p.collect, { root: ROOT, ignore: IGNORE });
  await page.evaluate(() => { document.documentElement.dir = "ltr"; });
  for (const f of p.mirror(ltr, rtl)) out.push({ ...f, where, check: "mirror" });
  const kept = out.splice(from).filter((x) => !skip.has(x.path) && !/ProseMirror|tiptap/.test(x.path));
  out.push(...kept);
  console.log(`[spacing] ${where}: ${Date.now() - t0} ms, ${out.length} findings so far`);
}

/** The More menu's items that open a surface of their own (a dialog or a sheet). */
async function moreItems(page: Page): Promise<string[]> {
  await moreMenu(page);
  const names = await page.getByRole("menu", { name: "More" }).getByRole("menuitem").allInnerTexts();
  await reset(page);
  return names.map((n) => (n.split("\n")[0] ?? "").trim()).filter((n) => n.endsWith("…"));
}

for (const { name: sizeName, size } of SIZES) {
  for (const want of ["light", "dark"] as const) {
    test(`spacing audit: every surface, ${want}, ${sizeName} window`, async () => {
      test.skip(!ON && !(want === "light" && sizeName === "default"), "Opt in with SPACING_AUDIT=1");
      test.setTimeout(ON ? 1_800_000 : 300_000);
      const p = (await import(pathToFileURL(PROBE).href)) as Probe;
      const out: (Finding & { where: string; check: string })[] = [];
      const done: string[] = [];
      const l = await start(size);
      const { page } = l;
      await scheme(page, want);
      await reset(page);
      const ctx = `${want}, ${sizeName}`;
      for (const s of SURFACES.filter((x) => (ON || CORE.includes(x.name)) && (!process.env.VQ_ONLY || process.env.VQ_ONLY.split(",").includes(x.name)))) {
        try {
          await s.open(page);
          await audit(page, p, `${s.name} (${ctx})`, out, sizeName === "default");
          done.push(s.name);
        } catch (e) {
          out.push({ severity: "--", rule: "not-reached", path: s.name, measured: ((e as Error).message.split("\n")[0] ?? ""), expected: "", fix: "", where: `${s.name} (${ctx})`, check: "open" });
        }
        await reset(page).catch(() => {});
      }
      // Everything the More menu opens (Share, Theme, Customize toolbar, New project, Help…).
      const more = ON && !process.env.VQ_ONLY ? await moreItems(page) : [];
      if (ON && !process.env.VQ_ONLY) expect(more.length, "the More menu lists the surfaces it opens").toBeGreaterThan(0);
      for (const item of more) {
        console.log(`[spacing] more item: ${item}`);
        // Items that open the system's own dialogs (a file picker, printing) are outside the app's design system.
        if (/quit|exit|close window|check for updates|open file|open project|import|export|print|save as|reveal|show in/i.test(item)) continue;
        try {
          await moreMenu(page);
          await page.getByRole("menu", { name: "More" }).getByRole("menuitem", { name: item }).first().click();
          await page.waitForTimeout(400);
          await audit(page, p, `more › ${item} (${ctx})`, out, sizeName === "default");
          done.push(`more › ${item}`);
        } catch (e) {
          out.push({ severity: "--", rule: "not-reached", path: item, measured: ((e as Error).message.split("\n")[0] ?? ""), expected: "", fix: "", where: `more › ${item} (${ctx})`, check: "open" });
        }
        await reset(page).catch(async () => { for (let i = 0; i < 4; i++) await page.keyboard.press("Escape"); });
      }
      // 200 % text and WCAG 1.4.12 text spacing on the plain canvas and Settings: only losses count.
      await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
      await page.evaluate(() => { const s = new CSSStyleSheet(); s.replaceSync("* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-block-end: 2em !important; }"); document.adoptedStyleSheets = [...document.adoptedStyleSheets, s]; });
      const largeTextSurfaces = process.env.VQ_ONLY ? [] : [["canvas", async () => {}], ["settings", async () => { await page.keyboard.press(`${mod}+,`); await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible(); }]] as const;
      for (const [label, open] of largeTextSurfaces) {
        try {
          await open();
          await geometrySettled(page);
          const big = await page.evaluate(p.collect, { root: ROOT, ignore: IGNORE });
          for (const f of p.analyze(big, { base: 4 }).filter((f) => ["page-scroll", "clipped", "overlap", "content-intrudes"].includes(f.rule))) out.push({ ...f, where: `${label}, 200 % text + text spacing (${ctx})`, check: "large text" });
        } catch { /* reached or not, measured what was there */ }
        await reset(page).catch(() => {});
      }
      mkdirSync(OUT, { recursive: true });
      writeFileSync(join(OUT, `surfaces-${want}-${sizeName}.json`), JSON.stringify({ done, findings: out }, null, 1));
      await quit(l);
      enforce(out);
    });
  }
}

test("spacing audit: Open view, New project and its location choice", async () => {
  test.skip(!ON, "Opt in with SPACING_AUDIT=1");
  test.setTimeout(600_000);
  const p = (await import(pathToFileURL(PROBE).href)) as Probe;
  const out: (Finding & { where: string; check: string })[] = [];
  const done: string[] = [];
  for (const want of ["light", "dark"] as const) {
    const dirs = tempDirs();
    for (let i = 1; i <= 6; i++) writeFileSync(join(dirs.docs, `Idea ${i}.md`), `# Idea ${i}\n\nA thought.\n`);
    const l = await launch(dirs);
    const { page } = l;
    await page.emulateMedia({ colorScheme: want });
    await expect(page.getByRole("heading", { name: "Open", level: 2 })).toBeVisible({ timeout: 15_000 });
    await audit(page, p, `Open view (${want})`, out, want === "light");
    done.push("Open view");
    for (const name of ["New project…", "Open from GitHub…"]) {
      try {
        await page.getByRole("button", { name }).click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await audit(page, p, `${name} (${want})`, out, want === "light");
        done.push(name);
        // Each step the dialog offers without an account or a real folder.
        for (let step = 0; step < 3; step++) {
          const next = page.getByRole("dialog").getByRole("button", { name: /^(Continue|Next)$/ }).first();
          if (!(await next.isVisible().catch(() => false))) break;
          await next.click().catch(() => {});
          await page.waitForTimeout(500);
          if (!(await page.getByRole("dialog").isVisible().catch(() => false))) break;
          await audit(page, p, `${name} step ${step + 2} (${want})`, out, false);
          done.push(`${name} step ${step + 2}`);
        }
      } catch (e) {
        out.push({ severity: "--", rule: "not-reached", path: name, measured: ((e as Error).message.split("\n")[0] ?? ""), expected: "", fix: "", where: `${name} (${want})`, check: "open" });
      }
      for (let i = 0; i < 3; i++) await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    }
    await quit(l);
  }
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, "open-view.json"), JSON.stringify({ done, findings: out }, null, 1));
  enforce(out);
});

test("spacing audit: first run", async () => {
  test.skip(!ON, "Opt in with SPACING_AUDIT=1");
  test.setTimeout(600_000);
  const p = (await import(pathToFileURL(PROBE).href)) as Probe;
  const out: (Finding & { where: string; check: string })[] = [];
  const done: string[] = [];
  for (const want of ["light", "dark"] as const) {
    const l = await launch(tempDirs(), {}, { firstRun: true });
    const { page } = l;
    await page.emulateMedia({ colorScheme: want });
    await page.waitForTimeout(800);
    // The first steps, as far as a Continue or Next goes without an account.
    for (let step = 0; step < 6; step++) {
      const title = (await page.locator("h1, h2").first().innerText().catch(() => `step ${step}`)).trim();
      await audit(page, p, `first run › ${title} (${want})`, out, want === "light");
      done.push(`first run › ${title}`);
      const next = page.getByRole("button", { name: /^(Continue|Next|Skip)/ }).first();
      if (!(await next.isVisible().catch(() => false))) break;
      await next.click().catch(() => {});
      await page.waitForTimeout(600);
    }
    await quit(l);
  }
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, "first-run.json"), JSON.stringify({ done, findings: out }, null, 1));
  enforce(out);
});
