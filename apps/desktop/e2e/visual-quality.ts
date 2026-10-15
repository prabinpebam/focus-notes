/**
 * The visual quality checklist's geometry rules (Foundations → Visual quality, D-111), checked on
 * whatever is open in a page: the desktop's journeys and the web's use the same checks.
 *
 * - Inside the window: every overlay (scrims, dialogs, sheets, menus, popovers, tooltips, toasts) is
 *   inside the window as drawn (the app root on Windows and Linux, inside its shadow margin), and a
 *   scrim dims exactly the window.
 * - Never edge to edge: a dialog keeps at least 24 px from every window edge.
 * - Inside its container: nothing in a surface spills out of it, and no scroller in it scrolls sideways.
 * - Uniform padding: the space from a surface's edge to its content is the same on all four sides.
 * - Floating side sheets: the same inset from the window's top, side, and bottom, clear of the
 *   trigger and the window's controls.
 * - Gaps between items: the highlight shapes of neighboring list items never touch (2 px apart).
 * - Fading scroll edges: only the note fades and blurs (up to 40 px) a 50 px edge, exactly where
 *   there's more to scroll to; interface surfaces never do. Fade only with reduced transparency or
 *   in software compositing (D-121).
 * - Selection by background: selected and active items show a background, never a side bar.
 * - Aligned rows: a checkbox, switch, or radio is centered on the first line of its label.
 * - Anchored tooltips: next to the control they name, centered on it, inside the window.
 *
 * Surfaces mark themselves with `data-surface` (dialog, sheet, popover, panel, toast) and scrims
 * with `data-scrim`, in `packages/ui`.
 */
import { expect, type Locator, type Page } from "@playwright/test";

export type VisualRule = "window" | "dialogInset" | "dialogHeight" | "container" | "padding" | "insets" | "sheet" | "groups" | "gaps" | "fade" | "trigger" | "selection" | "rings" | "slider" | "rows" | "tooltips";

export interface VisualOptions {
  /** Rules that don't apply to what's open, each with the reason (shown if it's ever questioned). */
  skip?: Partial<Record<VisualRule, string>>;
}

/** The distances, in CSS px, the rules use (Foundations → Visual quality). */
export const VISUAL = { dialogInset: 24, dialogMinHeight: 400, itemGap: 2, fade: 50, blur: 40, triggerClear: 80, groupGap: 16, tolerance: 1, tooltipGap: 16 } as const;

/** Everything on the open surfaces that breaks a rule, one line each; empty when it all holds. */
export function visualProblems(page: Page, opts: VisualOptions = {}): Promise<string[]> {
  return page.evaluate(audit, { skip: Object.keys(opts.skip ?? {}), v: VISUAL });
}

/** No animation running: an entering or leaving surface is measured once it's done. */
export const settled = (page: Page) => page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));

/** Tooltips show on hover once the pointer was last used (React Aria's modality), so the pointer moves first. */
export async function pointerModality(page: Page) {
  // A move is enough, and changes nothing a press would (a press outside closes the toolbar).
  const at = await page.evaluate(() => {
    const r = document.querySelector("[data-app-root]")?.getBoundingClientRect() ?? new DOMRect(0, 0, innerWidth, innerHeight);
    return { x: r.left + r.width / 2, y: r.bottom - 4 };
  });
  await page.mouse.move(at.x, at.y);
  await page.mouse.move(at.x + 1, at.y);
}

const TOOLTIP_RULES: VisualOptions = { skip: { dialogHeight: "checked without the tooltip", rings: "checked without the tooltip", slider: "checked without the tooltip", selection: "checked without the tooltip", dialogInset: "checked without the tooltip", container: "checked without the tooltip", padding: "checked without the tooltip", insets: "checked without the tooltip", sheet: "checked without the tooltip", groups: "checked without the tooltip", gaps: "checked without the tooltip", fade: "checked without the tooltip", trigger: "checked without the tooltip", rows: "checked without the tooltip" } };

/** Hovers each control with a tooltip and checks the tooltip it shows; at least one must show. */
export async function hoverTooltips(page: Page, controls: Locator, where: string, problems: string[], shot?: string) {
  await pointerModality(page);
  const n = await controls.count();
  let seen = 0;
  for (let i = 0; i < n; i++) {
    const c = controls.nth(i);
    if (!(await c.isVisible())) continue;
    // As a person's pointer arrives: across the window, then onto the control, so React Aria sees
    // the pointer in use when the hover starts (it reads the last input it saw). A second approach
    // if the control moved away from under it.
    let id: string | null = null;
    for (let attempt = 0; attempt < 2 && !id; attempt++) {
      // In view (a short sheet scrolls its header away), and where it is now: a dialog can move as
      // its content loads (Settings' account check).
      await c.evaluate((el) => el.scrollIntoView({ block: "center", inline: "nearest" }));
      await settled(page);
      const b = await c.boundingBox();
      if (!b) break;
      if (attempt) await pointerModality(page);
      else await page.mouse.move(b.x + b.width / 2, b.y + b.height + 24, { steps: 4 });
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 10 });
      id = await expect.poll(() => c.getAttribute("aria-describedby"), { timeout: 2000 }).toMatch(/\S/).then(() => c.getAttribute("aria-describedby"), () => null);
    }
    if (!id) continue;
    await settled(page);
    if (shot && !seen) await page.screenshot({ path: shot });
    seen++;
    for (const p of await visualProblems(page, TOOLTIP_RULES)) problems.push(`${where}, tooltip of ${await c.getAttribute("aria-label")}: ${p}`);
  }
  if (!seen) problems.push(`${where}: no tooltip showed on hover`);
  await pointerModality(page);
}

/**
 * Dialogs never shrink while open (D-111): runs each step (a tab, a filter) and checks the open
 * dialog's height never goes down; returns the problems.
 */
export async function dialogNeverShrinks(page: Page, name: string, steps: (() => Promise<void>)[]): Promise<string[]> {
  const height = () => page.evaluate(() => document.querySelector('[data-dialog-modal][data-height="stable"]')?.getBoundingClientRect().height ?? 0);
  const out: string[] = [];
  let tallest = await height();
  for (const [i, step] of steps.entries()) {
    await step();
    await settled(page);
    const h = await height();
    if (h < tallest - 0.5) out.push(`${name}: the dialog shrank from ${Math.round(tallest)} to ${Math.round(h)} px at step ${i + 1}`);
    tallest = Math.max(tallest, h);
  }
  return out;
}

/**
 * The note's scrollbar thumb stays clear of the window's rounded corners (D-111): at the top and
 * the bottom of the note, the thumb (found by its pixels: shown, less hidden) is inside the window
 * less its corner radius at both ends, so the corner's curve never cuts it.
 */
export async function scrollbarClearOfCorners(page: Page): Promise<string[]> {
  const out: string[] = [];
  const geo = await page.evaluate(() => {
    const sc = document.querySelector<HTMLElement>("[data-editor-scroller]")!;
    const root = document.querySelector("[data-app-root]");
    const win = (document.documentElement.dataset.windowFrame && root ? root : document.documentElement).getBoundingClientRect();
    const r = sc.getBoundingClientRect();
    const radius = root ? parseFloat(getComputedStyle(root).borderTopRightRadius) || 0 : 0;
    return { x: r.left + sc.clientLeft + sc.clientWidth, width: r.right - (r.left + sc.clientLeft + sc.clientWidth), top: win.top, bottom: win.bottom, radius };
  });
  if (geo.width < 2 || !geo.radius) return out;
  for (const end of ["top", "bottom"] as const) {
    await page.evaluate(async (e) => {
      const sc = document.querySelector<HTMLElement>("[data-editor-scroller]")!;
      sc.scrollTop = e === "top" ? 0 : sc.scrollHeight;
      // The scroll event (which shows the thumb for a moment) comes with the next frame.
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }, end);
    await page.waitForFunction(() => !document.querySelector("[data-editor-scroller]")!.hasAttribute("data-scrolling"), undefined, { timeout: 10_000 });
    const clip = { x: geo.x, y: geo.top, width: geo.width, height: geo.bottom - geo.top };
    const hidden = (await page.screenshot({ clip, scale: "css" })).toString("base64");
    await page.evaluate(() => document.querySelector("[data-editor-scroller]")!.setAttribute("data-scrollbar-hover", ""));
    const shown = (await page.screenshot({ clip, scale: "css" })).toString("base64");
    await page.evaluate(() => document.querySelector("[data-editor-scroller]")!.removeAttribute("data-scrollbar-hover"));
    const rows = await page.evaluate(async ([a, b]) => {
      const pixels = async (s: string) => {
        const bytes = Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
        const bmp = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
        const cv = new OffscreenCanvas(bmp.width, bmp.height);
        const cx = cv.getContext("2d")!;
        cx.drawImage(bmp, 0, 0);
        return cx.getImageData(0, 0, bmp.width, bmp.height);
      };
      const [p, q] = [await pixels(a!), await pixels(b!)];
      let first = -1, last = -1;
      for (let y = 0; y < p.height; y++) {
        for (let x = 0; x < p.width; x++) {
          const i = (y * p.width + x) * 4;
          if (Math.abs(p.data[i]! - q.data[i]!) + Math.abs(p.data[i + 1]! - q.data[i + 1]!) + Math.abs(p.data[i + 2]! - q.data[i + 2]!) > 24) {
            if (first < 0) first = y;
            last = y + 1;
            break;
          }
        }
      }
      return { first, last, height: p.height };
    }, [hidden, shown]);
    if (rows.first < 0) { out.push(`scrollbar: no thumb showed at the ${end} of the note`); continue; }
    const fromTop = rows.first, fromBottom = rows.height - rows.last;
    if (fromTop < geo.radius - VISUAL.tolerance) out.push(`scrollbar: at the ${end} of the note the thumb starts ${fromTop} px below the window's top, inside its ${geo.radius} px corner`);
    if (fromBottom < geo.radius - VISUAL.tolerance) out.push(`scrollbar: at the ${end} of the note the thumb ends ${fromBottom} px above the window's bottom, inside its ${geo.radius} px corner`);
  }
  return out;
}

const RINGS_ONLY: VisualOptions = { skip: Object.fromEntries((["window", "dialogInset", "dialogHeight", "container", "padding", "insets", "sheet", "groups", "gaps", "fade", "trigger", "selection", "slider", "rows", "tooltips"] as const).map((r) => [r, "checks the rings alone"])) };

/**
 * Focus rings on every list-like surface (D-111): where focus is in a list, tree, menu, tab list,
 * radio group or grid (or a combobox's list), moves it by keyboard to the last item and the first,
 * where a clipping container is most likely to cut a ring, and checks the ring at each.
 */
export async function listRings(page: Page, where: string): Promise<string[]> {
  const kind = () => page.evaluate(() => {
    const a = document.activeElement;
    if (!a || a.closest("[data-editor]")) return null;
    if (a.getAttribute("role") === "combobox" && a.getAttribute("aria-controls")) return "combobox";
    return a.closest('[role="tree"], [role="listbox"], [role="menu"], [role="tablist"], [role="radiogroup"], [role="grid"]') ? "list" : null;
  });
  const k = await kind();
  if (!k) return [];
  const out: string[] = [];
  const keys = k === "combobox" ? ["ArrowUp", "ArrowDown"] : ["End", "Home"];
  for (const key of keys) {
    await page.keyboard.press(key);
    await settled(page);
    for (const p of await visualProblems(page, RINGS_ONLY)) out.push(`${where}, after ${key}: ${p}`);
  }
  return out;
}
function audit({ skip, v }: { skip: string[]; v: typeof VISUAL }): string[] {
  const out: string[] = [];
  const on = (rule: string) => !skip.includes(rule);
  const tol = v.tolerance;
  const px = (n: number) => Math.round(n * 10) / 10;
  const box = (r: DOMRect | { left: number; top: number; right: number; bottom: number }) => `${px(r.left)},${px(r.top)}–${px(r.right)},${px(r.bottom)}`;
  const nameOf = (el: Element): string => {
    const label = el.getAttribute("aria-label") ?? (el.getAttribute("aria-labelledby") ? document.getElementById(el.getAttribute("aria-labelledby")!.split(" ")[0]!)?.textContent : null);
    const kind = el.getAttribute("data-surface") ?? el.getAttribute("role") ?? el.tagName.toLowerCase();
    const text = label ?? el.textContent?.trim().slice(0, 30) ?? "";
    return `${kind} “${text}”`;
  };
  const root = document.querySelector("[data-app-root]");
  const framed = Boolean(document.documentElement.dataset.windowFrame);
  const win = framed && root ? root.getBoundingClientRect() : new DOMRect(0, 0, innerWidth, innerHeight);
  const shown = (el: Element) => {
    if (!el.isConnected || el.closest("[inert], [aria-hidden=true]")) return false;
    if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };
  // Settled: an entering or leaving surface is mid-animation and measured once it's done.
  type Box = { left: number; top: number; right: number; bottom: number };
  const rect = (el: Element): Box => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  };
  const clips = (el: Element) => {
    const cs = getComputedStyle(el);
    return [cs.overflowX, cs.overflowY].some((o) => o !== "visible");
  };
  /**
   * The part of `el` that shows: cut by every clipping ancestor up to (not including) `stop`. A
   * scroller cuts at its content box: what scrolls past it into its padding is under its fading edge.
   */
  const visiblePart = (el: Element, stop: Element | null): Box | null => {
    let r = rect(el);
    for (let a = el.parentElement; a && a !== stop; a = a.parentElement) {
      if (!clips(a)) continue;
      const ac = getComputedStyle(a);
      const scroller = ac.overflowY === "auto" || ac.overflowY === "scroll";
      const o = rect(a);
      const c = scroller ? { left: o.left, right: o.right, top: o.top + a.clientTop + parseFloat(ac.paddingTop), bottom: o.top + a.clientTop + a.clientHeight - parseFloat(ac.paddingBottom) } : o;
      r = { left: Math.max(r.left, c.left), top: Math.max(r.top, c.top), right: Math.min(r.right, c.right), bottom: Math.min(r.bottom, c.bottom) };
      if (r.right - r.left <= 0.5 || r.bottom - r.top <= 0.5) return null;
    }
    return r;
  };
  const inside = (r: Box, c: Box, slack = tol / 2) => r.left >= c.left - slack && r.top >= c.top - slack && r.right <= c.right + slack && r.bottom <= c.bottom + slack;

  const surfaces = [...document.querySelectorAll("[data-surface]")].filter(shown);
  const scrims = [...document.querySelectorAll("[data-scrim]")].filter(shown);
  const tooltips = [...document.querySelectorAll('[role="tooltip"]')].filter(shown);

  // Inside the window. The app root clips what it holds, so a surface is measured before that cut:
  // one that only shows inside the window because the window cuts it off is still outside.
  if (on("window")) {
    for (const el of [...surfaces, ...scrims, ...tooltips]) {
      const r = visiblePart(el, root);
      if (r && !inside(r, win)) out.push(`inside the window: ${nameOf(el)} at ${box(r)} goes past the window ${box(win)}`);
    }
    for (const s of scrims) {
      const r = rect(s);
      if (Math.abs(r.left - win.left) > tol || Math.abs(r.top - win.top) > tol || Math.abs(r.right - win.right) > tol || Math.abs(r.bottom - win.bottom) > tol) out.push(`inside the window: the scrim ${box(r)} isn't the window ${box(win)}`);
    }
  }

  if (on("dialogInset")) {
    for (const d of surfaces.filter((s) => s.getAttribute("data-surface") === "dialog")) {
      const r = rect(d);
      const gaps = { left: r.left - win.left, top: r.top - win.top, right: win.right - r.right, bottom: win.bottom - r.bottom };
      for (const [side, g] of Object.entries(gaps)) if (g < v.dialogInset - tol / 2) out.push(`never edge to edge: ${nameOf(d)} is ${px(g)} px from the window's ${side} edge (at least ${v.dialogInset})`);
    }
  }

  if (on("dialogHeight")) {
    // At least 400 px, less only where the window with its inset has no room; at most that room, and
    // all of it before its body scrolls (no other cap comes first). The room is what the scrim leaves
    // inside its padding: the window less 24 px on each side (Spotlight's starts 20% down).
    // Confirmations (`data-height="content"`: Delete, Sign out, Remove workspace, Import) are short
    // alerts, exempt from the least height; they keep the inset and the rest (D-111).
    for (const m of [...document.querySelectorAll('[data-dialog-modal][data-height="stable"]')].filter(shown)) {
      const h = rect(m).bottom - rect(m).top;
      const overlay = m.closest("[data-scrim]") ?? m.parentElement!;
      const oc = getComputedStyle(overlay);
      const room = Math.min(overlay.clientHeight - parseFloat(oc.paddingTop) - parseFloat(oc.paddingBottom), win.height - 2 * v.dialogInset);
      const least = Math.min(v.dialogMinHeight, room);
      const name = nameOf(m.querySelector("[data-surface=dialog]") ?? m);
      if (h < least - tol) out.push(`dialog height: ${name} is ${px(h)} px tall (at least ${px(least)})`);
      const body = m.querySelector("[data-dialog-body]");
      if (body && body.scrollHeight > body.clientHeight + 1 && h < room - tol) out.push(`dialog height: ${name} scrolls at ${px(h)} px with ${px(room)} px of room`);
      // Side navigation (vertical tabs, Settings) runs the full height of the body, its divider from
      // the top of the body to the bottom (D-123).
      if (body) {
        const bc = getComputedStyle(body);
        const full = body.scrollHeight - parseFloat(bc.paddingTop) - parseFloat(bc.paddingBottom);
        for (const nav of body.querySelectorAll('[role="tablist"][aria-orientation="vertical"]')) {
          const nh = nav.getBoundingClientRect().height;
          if (nh < full - tol) out.push(`side navigation: ${nameOf(nav)} in ${name} is ${px(nh)} px tall, short of its body's ${px(full)} px`);
        }
      }
    }
  }

  if (on("rings")) {
    // A focus ring is never cut by a scrolling or clipping container around it, and an item in a list
    // (a list, tree, menu, tab list, gallery) draws its ring inside its own shape (D-111). The ring is
    // the focused element's, or its active descendant's (a combobox's highlighted option).
    const active = document.activeElement;
    const descendant = active?.getAttribute("aria-activedescendant");
    const f = (descendant ? document.getElementById(descendant) : null) ?? active;
    if (f && f !== document.body && !f.closest("[data-editor]") && shown(f)) {
      const cs = getComputedStyle(f);
      if (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) {
        const reach = parseFloat(cs.outlineWidth) + parseFloat(cs.outlineOffset || "0");
        const ITEMS = '[role="option"], [role="treeitem"], [role="tab"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="radio"], [role="row"], [role="gridcell"]';
        if (f.matches(ITEMS) && reach > tol / 2) out.push(`focus rings: ${nameOf(f)} draws its ring ${px(reach)} px outside itself (inside, in a list)`);
        const r = rect(f);
        const ring = { left: r.left - reach, top: r.top - reach, right: r.right + reach, bottom: r.bottom + reach };
        for (let a = f.parentElement; a && a !== root; a = a.parentElement) {
          if (!clips(a)) continue;
          const o = rect(a);
          const clip = { left: o.left + a.clientLeft, top: o.top + a.clientTop, right: o.left + a.clientLeft + a.clientWidth, bottom: o.top + a.clientTop + a.clientHeight };
          // Only where the item itself shows: one scrolled partly out of view is cut by design.
          if (r.top < clip.top - tol || r.bottom > clip.bottom + tol) break;
          if (ring.left < clip.left - tol / 2 || ring.right > clip.right + tol / 2 || ring.top < clip.top - tol / 2 || ring.bottom > clip.bottom + tol / 2) {
            out.push(`focus rings: the ring of ${nameOf(f)} at ${box(ring)} is cut by ${nameOf(a)} ${box(clip)}`);
            break;
          }
        }
      }
    }
  }

  if (on("slider")) {
    for (const thumb of [...document.querySelectorAll("[data-slider-thumb]")].filter(shown)) {
      const track = thumb.parentElement!;
      const rail = track.querySelector("[data-slider-rail]");
      const fill = track.querySelector("[data-slider-fill]");
      if (!rail || !fill) continue;
      const t = rect(thumb), l = rect(rail), fl = rect(fill);
      const dy = (t.top + t.bottom) / 2 - (l.top + l.bottom) / 2;
      if (Math.abs(dy) > 0.5) out.push(`slider: the thumb of ${nameOf(track.closest('[role="group"]') ?? track)} is ${px(dy)} px off the track's center line`);
      const dx = fl.right - (t.left + t.right) / 2;
      if (Math.abs(dx) > 0.5) out.push(`slider: the fill of ${nameOf(track.closest('[role="group"]') ?? track)} ends ${px(dx)} px from the thumb's center`);
    }
  }

  /** What a surface shows: text, pictures, controls, and anything with a fill or a border. */
  // Controls count by their box, the shape their hover and press fill; one that bleeds into the
  // padding (`data-bleed`, a dialog's close button) by its icon and text, which line up with the edge.
  // A text inset like a control's label (`data-inset="control"`, the link card's address) counts as one.
  const CONTROLS = '[data-inset="control"], button, a[href], input, textarea, select, svg, img, canvas, hr, kbd, [role="button"], [role="tab"], [role="radio"], [role="checkbox"], [role="switch"], [role="option"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="treeitem"], [role="slider"], [role="combobox"], [role="searchbox"], [role="textbox"], [role="separator"]';
  const scrolls = (el: Element) => {
    const o = getComputedStyle(el);
    return (o.overflowY === "auto" || o.overflowY === "scroll") && (el.scrollHeight > el.clientHeight + 1 || parseFloat(o.flexGrow) > 0);
  };
  const painted = (el: Element) => {
    if (el.matches(CONTROLS) && !el.hasAttribute("data-bleed")) return true;
    // A scrolling area that fills its surface, or has more than shows, is content to its edges.
    if (scrolls(el)) return true;
    const cs = getComputedStyle(el);
    const seen = (c: string) => c !== "transparent" && !/rgba\([^)]*,\s*0\)$/.test(c);
    // A fill only a state gives (pressed, selected, hovered) isn't where the content's edge is.
    const state = el.matches('[aria-pressed="true"], [data-selected], [data-hovered], [data-pressed]');
    if (!state && (seen(cs.backgroundColor) || cs.backgroundImage !== "none")) return true;
    return (["Top", "Right", "Bottom", "Left"] as const).some((side) => parseFloat(cs[`border${side}Width`]) > 0 && cs[`border${side}Style`] !== "none" && seen(cs[`border${side}Color`]));
  };
  /** Boxes of what `surface` shows, each cut by the scrollers inside it; nested surfaces and tooltips aren't its own. */
  const contentOf = (surface: Element) => {
    const boxes: { el: Element; r: Box }[] = [];
    const walker = document.createTreeWalker(surface, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => {
        if (n === surface) return NodeFilter.FILTER_SKIP;
        if (n instanceof Element && (n.hasAttribute("data-surface") || n.matches('[role="tooltip"], [data-vq-ignore]') || !n.checkVisibility({ opacityProperty: true, visibilityProperty: true }))) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n instanceof Text) {
        if (!n.data.trim() || !n.parentElement) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        for (const line of range.getClientRects()) {
          if (line.width < 1 || line.height < 1) continue;
          // Cut by its element too: a heading's box is trimmed to its letters (text-box-trim).
          const cut = visiblePart(n.parentElement, surface);
          const own = n.parentElement.getBoundingClientRect();
          if (!cut) continue;
          const r = { left: Math.max(line.left, cut.left), top: Math.max(line.top, cut.top, own.top), right: Math.min(line.right, cut.right), bottom: Math.min(line.bottom, cut.bottom, own.bottom) };
          if (r.right - r.left > 0.5 && r.bottom - r.top > 0.5) boxes.push({ el: n.parentElement, r });
        }
        continue;
      }
      const el = n as Element;
      if (!painted(el)) continue;
      const own = el.getBoundingClientRect();
      // Visually hidden helpers (1 px, clipped) aren't content.
      if (own.width <= 1 || own.height <= 1) continue;
      const r = visiblePart(el, surface);
      if (!r) continue;
      if (scrolls(el)) {
        // A scroller's content box: without its padding and its scrollbar's room.
        const cs = getComputedStyle(el);
        const left = own.left + el.clientLeft + parseFloat(cs.paddingLeft);
        const top = own.top + el.clientTop + parseFloat(cs.paddingTop);
        boxes.push({ el, r: { left: Math.max(r.left, left), top: Math.max(r.top, top), right: Math.min(r.right, own.left + el.clientLeft + el.clientWidth - parseFloat(cs.paddingRight)), bottom: Math.min(r.bottom, own.top + el.clientTop + el.clientHeight - parseFloat(cs.paddingBottom)) } });
      } else boxes.push({ el, r });
    }
    return boxes;
  };

  for (const s of surfaces) {
    const kind = s.getAttribute("data-surface")!;
    const outer = rect(s);
    const cs = getComputedStyle(s);
    const inner = { left: outer.left + parseFloat(cs.borderLeftWidth), top: outer.top + parseFloat(cs.borderTopWidth), right: outer.right - parseFloat(cs.borderRightWidth), bottom: outer.bottom - parseFloat(cs.borderBottomWidth) };
    const content = contentOf(s);
    if (on("container")) {
      for (const { el, r } of content) {
        // Measured unclipped by the surface itself, which may clip what spills out.
        const full = visiblePart(el, s);
        if (full && !inside(full, inner)) {
          out.push(`inside its container: ${nameOf(el)} at ${box(full)} spills out of ${nameOf(s)} ${box(inner)}`);
          break;
        }
        void r;
      }
      for (const el of [s, ...s.querySelectorAll("*")]) {
        if (el !== s && el.closest("[data-surface]") !== s) continue;
        const o = getComputedStyle(el);
        if ((o.overflowX === "auto" || o.overflowX === "scroll") && el.scrollWidth > el.clientWidth + 1 && el.getAttribute("data-scroll-x") === null) {
          out.push(`inside its container: ${nameOf(el)} in ${nameOf(s)} scrolls sideways (${el.scrollWidth} px of ${el.clientWidth})`);
        }
      }
    }
    if (on("padding") && kind !== "toast" && content.length && s.getAttribute("data-vq-padding") !== "none") {
      const edge = (pick: (r: Box) => number, most: (a: number, b: number) => boolean) => content.reduce((a, c) => (most(pick(c.r), pick(a.r)) ? c : a));
      const by = { top: edge((r) => r.top, (a, b) => a < b), left: edge((r) => r.left, (a, b) => a < b), right: edge((r) => r.right, (a, b) => a > b), bottom: edge((r) => r.bottom, (a, b) => a > b) };
      const pad = { top: by.top.r.top - inner.top, left: by.left.r.left - inner.left, right: inner.right - by.right.r.right, bottom: inner.bottom - by.bottom.r.bottom };
      const values = Object.values(pad);
      if (Math.max(...values) - Math.min(...values) > tol) out.push(`uniform padding: ${nameOf(s)} has ${(Object.keys(pad) as (keyof typeof pad)[]).map((k) => `${k} ${px(pad[k])} (${nameOf(by[k].el)})`).join(", ")}`);
    }
    // A one-row bar (the link card) reads by its ink, not its boxes: a subtle button's box is
    // invisible at rest, so what the eye measures is its label. The ink at each end sits the same
    // distance from the edge (D-111).
    if (on("insets") && kind !== "toast" && s.getAttribute("data-vq-padding") !== "none") {
      const ink: { r: Box; text: boolean }[] = [];
      const seen = (c: string) => c !== "transparent" && !/rgba\([^)]*,\s*0\)$/.test(c);
      for (const n of [s, ...s.querySelectorAll("*")]) {
        if (n !== s && (n.closest("[data-surface]") !== s || !shown(n))) continue;
        for (const c of n.childNodes) {
          if (!(c instanceof Text) || !c.data.trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(c);
          for (const l of range.getClientRects()) if (l.width >= 1 && l.height >= 1) ink.push({ r: l, text: true });
        }
        if (n === s) continue;
        const cs = getComputedStyle(n);
        const state = n.matches('[aria-pressed="true"], [data-selected], [data-hovered], [data-pressed], [data-focus-visible]');
        const filled = !state && (seen(cs.backgroundColor) || cs.backgroundImage !== "none" || (cs.maskImage && cs.maskImage !== "none") || (["Top", "Right", "Bottom", "Left"] as const).some((k) => parseFloat(cs[`border${k}Width`]) > 0 && cs[`border${k}Style`] !== "none" && seen(cs[`border${k}Color`])));
        if (filled || n.matches("svg, img, input, textarea, canvas")) ink.push({ r: rect(n), text: false });
      }
      const row = ink.length > 1 && ink.every(({ r }) => Math.min(r.bottom, ink[0]!.r.bottom) - Math.max(r.top, ink[0]!.r.top) > 0);
      const first = row ? ink.reduce((a, b) => (b.r.left < a.r.left ? b : a)) : null;
      const last = row ? ink.reduce((a, b) => (b.r.right > a.r.right ? b : a)) : null;
      // Text at both ends: a field or an icon at an end is measured by its box, as the padding rule does.
      if (first?.text && last?.text) {
        const left = first.r.left - inner.left;
        const right = inner.right - last.r.right;
        if (Math.abs(left - right) > tol) out.push(`uniform padding: ${nameOf(s)} shows its content ${px(left)} px from the start and ${px(right)} px from the end`);
      }
    }
  }

  if (on("groups")) {
    // A sheet's header and its body are separate groups: `space.l` (16 px) between them (D-111).
    for (const s of surfaces.filter((x) => x.getAttribute("data-surface") === "sheet")) {
      const header = s.querySelector("[data-sheet-header]");
      const body = s.querySelector("[data-sheet-body]");
      if (!header || !body || !shown(header) || !shown(body)) continue;
      const gap = rect(body).top + parseFloat(getComputedStyle(body).paddingTop) - rect(header).bottom;
      if (gap < v.groupGap - tol / 2) out.push(`grouped and spaced: ${nameOf(s)}'s header and its content are ${px(gap)} px apart (at least ${v.groupGap})`);
    }
  }

  if (on("sheet")) {
    const keepClear = [...document.querySelectorAll("[data-trigger-band]")].filter(shown);
    for (const s of surfaces.filter((x) => x.getAttribute("data-surface") === "sheet")) {
      const r = rect(s);
      const side = s.getAttribute("data-side") === "end" ? win.right - r.right : r.left - win.left;
      const top = r.top - win.top;
      const bottom = win.bottom - r.bottom;
      if (Math.abs(top - bottom) > tol || Math.abs(side - top) > tol) out.push(`floating side sheet: ${nameOf(s)} is inset ${px(top)} at the top, ${px(side)} at the side, and ${px(bottom)} at the bottom`);
      for (const k of keepClear) {
        const c = rect(k);
        if (c.left < r.right && c.right > r.left && c.top < r.bottom && c.bottom > r.top) out.push(`floating side sheet: ${nameOf(s)} covers ${nameOf(k)}`);
      }
    }
  }

  if (on("gaps")) {
    const ITEMS = '[role="treeitem"], [role="option"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]';
    for (const list of [...document.querySelectorAll('[role="tree"], [role="listbox"], [role="menu"]')].filter(shown)) {
      const items = [...list.querySelectorAll(ITEMS)].filter((i) => i.closest('[role="tree"], [role="listbox"], [role="menu"]') === list && shown(i)).map((el) => ({ el, r: rect(el) }));
      for (const a of items) {
        for (const b of items) {
          if (a === b) continue;
          // Below it, in the same column; or beside it, in the same row (a grid of tiles).
          const sameColumn = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left) > 0.5 * Math.min(a.r.right - a.r.left, b.r.right - b.r.left);
          const sameRow = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top) > 0.5 * Math.min(a.r.bottom - a.r.top, b.r.bottom - b.r.top);
          const gap = sameColumn && b.r.top >= a.r.top + 1 ? b.r.top - a.r.bottom : sameRow && b.r.left >= a.r.left + 1 ? b.r.left - a.r.right : null;
          // Only the nearest neighbor counts: anything further away has a bigger gap anyway.
          if (gap !== null && gap < v.itemGap - 0.25 && gap > -(a.r.bottom - a.r.top)) {
            out.push(`gaps between items: ${nameOf(a.el)} and ${nameOf(b.el)} in ${nameOf(list)} are ${px(gap)} px apart (at least ${v.itemGap})`);
          }
        }
      }
    }
  }

  if (on("fade")) {
    // No blur with reduced transparency, or in software compositing (D-121): the fade alone.
    const reduced = document.documentElement.dataset.transparency === "reduced" || document.documentElement.dataset.compositing === "software" || matchMedia("(forced-colors: active)").matches;
    for (const el of document.querySelectorAll("*")) {
      const o = getComputedStyle(el);
      if (o.overflowY !== "auto" && o.overflowY !== "scroll") continue;
      if (!shown(el) || el === document.documentElement || el === document.body) continue;
      const mask = o.maskImage && o.maskImage !== "none" ? o.maskImage : o.webkitMaskImage ?? "none";
      // The note's edges sit beside its scroller (over its edges, not scrolling with it).
      const edges = [...el.querySelectorAll(":scope > [data-scroll-edge]"), ...(el.parentElement?.querySelectorAll(":scope > [data-scroll-edge]") ?? [])];
      // Interface surfaces never fade or blur their scroll edges: only the note does.
      if (!el.hasAttribute("data-editor-scroller")) {
        if (mask !== "none" || edges.length) out.push(`fading scroll edges: ${nameOf(el)} fades its edges, but only the note may`);
        continue;
      }
      const more = { top: el.scrollTop > 1, bottom: el.scrollTop + el.clientHeight < el.scrollHeight - 1 };
      for (const side of ["top", "bottom"] as const) {
        const edge = edges.find((e) => e.getAttribute("data-scroll-edge") === side);
        const showing = Boolean(edge && getComputedStyle(edge).opacity === "1" && getComputedStyle(edge).visibility === "visible" && getComputedStyle(edge).display !== "none");
        if (more[side] !== showing) {
          out.push(`fading scroll edges: the note ${more[side] ? "has more to scroll to" : "has nothing more to scroll to"} at the ${side} but ${showing ? "fades it" : "doesn't fade it"}`);
          continue;
        }
        if (!edge || !showing) continue;
        const r = edge.getBoundingClientRect();
        // The top edge also hides the trigger's place: solid over `triggerClear`, then the fade.
        const tall = side === "top" ? v.triggerClear + v.fade : v.fade;
        if (Math.abs(r.height - tall) > tol) out.push(`fading scroll edges: the note's ${side} edge is ${px(r.height)} px, not ${tall}`);
        // The blur grows toward the edge, up to 40 px at it; none with reduced transparency.
        const blurs = [...edge.children].map((c) => /blur\(([\d.]+)px\)/.exec(getComputedStyle(c).backdropFilter)?.[1]).filter((b): b is string => b !== undefined && getComputedStyle(edge.children[0]!).display !== "none").map(Number);
        // 5 to 8 bands, the strongest (40 px) at the window's edge, each one in softer than the last.
        if (reduced ? blurs.length > 0 : blurs.length < 5 || blurs.length > 8 || blurs[0] !== v.blur || blurs.some((b, i) => i > 0 && b >= blurs[i - 1]!)) out.push(`fading scroll edges: the note's ${side} edge blurs ${blurs.join(", ") || "nothing"} px (up to ${reduced ? 0 : v.blur} at the edge, less further in)`);
        if (![...edge.children].some((c) => getComputedStyle(c).backgroundImage.startsWith("linear-gradient"))) out.push(`fading scroll edges: the note's ${side} edge doesn't fade`);
        // Nothing from the edge up may be a backdrop root, or its blurs see nothing behind them.
        for (let a: Element | null = edge; a && a !== document.documentElement; a = a.parentElement) {
          const c = getComputedStyle(a);
          const root = (c.filter !== "none" && "filter") || (Number(c.opacity) < 1 && "opacity") || (c.maskImage && c.maskImage !== "none" && "mask") || (c.clipPath !== "none" && "clip-path") || (c.mixBlendMode !== "normal" && "blend mode") || (a !== edge && c.backdropFilter && c.backdropFilter !== "none" && "backdrop filter") || (/filter|opacity/.test(c.willChange) && "will-change");
          if (root) out.push(`fading scroll edges: ${nameOf(a)} has a ${root}, so the note's ${side} edge can't blur the text behind it`);
        }
        // The note itself carries no mask: the edges draw the fade.
        if (mask !== "none") out.push(`fading scroll edges: the note's scroller has a mask (the edges draw the fade)`);
      }
    }
  }

  if (on("trigger")) {
    // The Snap Layouts picker, opened by keyboard from the toolbar's Tab order, never covers the
    // open trigger toolbar: one floating thing at a time in the title bar (D-119).
    const picker = surfaces.find((e) => e.querySelector("[data-zone]"));
    // The open toolbar's shape and anything in it that shows (its content can show without it).
    for (const panel of [...document.querySelectorAll("[data-morph-panel][data-open]")]) {
      if (!picker) break;
      const a = rect(picker);
      for (const part of [panel, ...panel.querySelectorAll("button")].filter(shown)) {
        const b = rect(part);
        if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) { out.push(`one floating thing at a time: ${nameOf(picker)} at ${box(a)} covers ${nameOf(part)} of the open toolbar at ${box(b)}`); break; }
      }
    }
    // Scrolled text never meets the trigger: where a line passes the trigger, it's under the solid
    // part of the note's top edge (all of it but the fade), so the dot never sits on readable text.
    const trigger = [...document.querySelectorAll("[data-trigger]")].find(shown);
    const note = document.querySelector("[data-editor-scroller]");
    if (trigger && note && shown(note)) {
      const t = rect(trigger);
      const edge = note.parentElement?.querySelector(':scope > [data-scroll-edge="top"]');
      const covering = edge && getComputedStyle(edge).visibility === "visible" && getComputedStyle(edge).display !== "none";
      const solid = covering ? rect(edge).bottom - v.fade : -Infinity;
      const walker = document.createTreeWalker(note, NodeFilter.SHOW_TEXT);
      let hit: string | null = null;
      for (let n = walker.nextNode(); n && !hit; n = walker.nextNode()) {
        const text = n as Text;
        if (!text.data.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(text);
        for (const l of range.getClientRects()) {
          const meets = l.left < t.right && l.right > t.left && l.top < t.bottom && l.bottom > t.top;
          if (meets && Math.min(l.bottom, t.bottom) > solid + tol / 2) { hit = `“${text.data.trim().slice(0, 30)}” at ${box(l)}`; break; }
        }
      }
      if (hit) out.push(`text under the trigger: ${hit} shows under the trigger at ${box(t)}${covering ? `, below the top edge's solid part (to ${px(solid)})` : ""}`);
    }
  }

  if (on("selection")) {
    // Selected and active items show a background, never a side bar or a border (D-111).
    const SELECTED = '[aria-selected="true"], [data-selected], [data-current], [aria-current]:not([aria-current="false"])';
    for (const el of [...document.querySelectorAll(SELECTED)].filter((e) => shown(e) && !e.closest("[data-editor]"))) {
      const cs = getComputedStyle(el);
      const seen = (c: string) => c !== "transparent" && !/rgba\([^)]*,\s*0\)$/.test(c);
      const sides = (["Top", "Right", "Bottom", "Left"] as const).map((k) => parseFloat(cs[`border${k}Width`]) > 0 && cs[`border${k}Style`] !== "none" && seen(cs[`border${k}Color`]));
      // An inset shadow draws a bar or a ring inside the item: either is a border by another name.
      const bar = /\binset\b/.test(cs.boxShadow);
      if (sides.some(Boolean) || bar) out.push(`selection by background: ${nameOf(el)} shows ${bar ? "a side bar" : "a border"} (${bar ? cs.boxShadow : cs.borderLeftColor})`);
      if (el.matches('[role="option"], [role="treeitem"], [role="tab"]') && el.getAttribute("aria-selected") === "true" && !seen(cs.backgroundColor)) out.push(`selection by background: ${nameOf(el)} is selected with no background`);
    }
  }

  if (on("rows")) {
    // Shown ones only: a visually hidden input (a segmented control's radio) is clipped to nothing.
    const controls = [...document.querySelectorAll('input[type="checkbox"], input[type="radio"], [role="checkbox"], [role="switch"]')].filter((c) => {
      const v = shown(c) && !c.textContent?.trim() ? visiblePart(c, null) : null;
      return v !== null && v.right - v.left > 1 && v.bottom - v.top > 1;
    });
    for (const c of controls) {
      // The label: the first text after the control in its row.
      let row = c.closest('li, label, [role="row"], [role="menuitemcheckbox"], [role="option"]') ?? c.parentElement;
      // A label holding only the control (a task's checkbox): its row is around it.
      if (row?.tagName === "LABEL" && !row.textContent?.trim()) row = row.parentElement;
      if (!row) continue;
      const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
      let text: Text | null = null;
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const box = n.parentElement?.getBoundingClientRect();
        // Read by screen readers only (1 px and clipped), not shown.
        if (!box || box.width <= 1 || box.height <= 1) continue;
        if ((n as Text).data.trim() && !c.contains(n) && c.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING) {
          text = n as Text;
          break;
        }
      }
      if (!text) continue;
      const range = document.createRange();
      const first = text.data.search(/\S/);
      range.setStart(text, first);
      range.setEnd(text, first + 1);
      const line = range.getClientRects()[0];
      if (!line) continue;
      const cr = rect(c);
      const dy = (cr.top + cr.bottom) / 2 - (line.top + line.bottom) / 2;
      if (Math.abs(dy) > tol) out.push(`aligned rows: ${nameOf(c)} is ${px(dy)} px off the center of its label's first line “${text.data.trim().slice(0, 24)}”`);
    }
  }

  if (on("tooltips")) {
    for (const t of tooltips) {
      const r = rect(t);
      const control = document.querySelector(`[aria-describedby~="${t.id}"]`);
      if (!control) {
        out.push(`anchored tooltips: ${nameOf(t)} names no control`);
        continue;
      }
      const c = rect(control);
      const below = r.top - c.bottom;
      const above = c.top - r.bottom;
      const beside = Math.max(r.left - c.right, c.left - r.right);
      const vertical = (below >= -tol && below <= v.tooltipGap) || (above >= -tol && above <= v.tooltipGap);
      const horizontal = beside >= -tol && beside <= v.tooltipGap && Math.min(r.bottom, c.bottom) > Math.max(r.top, c.top);
      if (!vertical && !horizontal) out.push(`anchored tooltips: ${nameOf(t)} at ${box(r)} isn't next to ${nameOf(control)} at ${box(c)}`);
      else if (vertical) {
        // Centered on it, unless the window's edge moved it; then it still overlaps the control.
        const off = (r.left + r.right) / 2 - (c.left + c.right) / 2;
        const atEdge = r.left - win.left < 16 || win.right - r.right < 16;
        if (Math.abs(off) > tol && !(atEdge && Math.min(r.right, c.right) > Math.max(r.left, c.left))) out.push(`anchored tooltips: ${nameOf(t)} is ${px(off)} px off the center of ${nameOf(control)}`);
      }
      if (!inside(r, win)) out.push(`anchored tooltips: ${nameOf(t)} at ${box(r)} goes past the window ${box(win)}`);
    }
  }
  return out;
}
