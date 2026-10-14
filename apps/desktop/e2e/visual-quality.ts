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
 * - Fading scroll edges: a scroller fades a 50 px edge exactly where there's more to scroll to.
 * - Aligned rows: a checkbox, switch, or radio is centered on the first line of its label.
 * - Anchored tooltips: next to the control they name, centered on it, inside the window.
 *
 * Surfaces mark themselves with `data-surface` (dialog, sheet, popover, panel, toast) and scrims
 * with `data-scrim`, in `packages/ui`.
 */
import { expect, type Locator, type Page } from "@playwright/test";

export type VisualRule = "window" | "dialogInset" | "container" | "padding" | "sheet" | "gaps" | "fade" | "rows" | "tooltips";

export interface VisualOptions {
  /** Rules that don't apply to what's open, each with the reason (shown if it's ever questioned). */
  skip?: Partial<Record<VisualRule, string>>;
}

/** The distances, in CSS px, the rules use (Foundations → Visual quality). */
export const VISUAL = { dialogInset: 24, itemGap: 2, fade: 50, tolerance: 1, tooltipGap: 16 } as const;

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

const TOOLTIP_RULES: VisualOptions = { skip: { dialogInset: "checked without the tooltip", container: "checked without the tooltip", padding: "checked without the tooltip", sheet: "checked without the tooltip", gaps: "checked without the tooltip", fade: "checked without the tooltip", rows: "checked without the tooltip" } };

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
      // Where it is now: a dialog can move as its content loads (Settings' account check).
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

/** Runs in the page. Everything it needs is inside it. */
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
  /** The part of `el` that shows: cut by every clipping ancestor up to (not including) `stop`. */
  const visiblePart = (el: Element, stop: Element | null): Box | null => {
    let r = rect(el);
    for (let a = el.parentElement; a && a !== stop; a = a.parentElement) {
      if (!clips(a)) continue;
      const c = rect(a);
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

  /** What a surface shows: text, pictures, controls, and anything with a fill or a border. */
  // Controls count by their box, the shape their hover and press fill; one that bleeds into the
  // padding (`data-bleed`, a dialog's close button) by its icon and text, which line up with the edge.
  const CONTROLS = 'button, a[href], input, textarea, select, svg, img, canvas, hr, kbd, [role="button"], [role="tab"], [role="radio"], [role="checkbox"], [role="switch"], [role="option"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="treeitem"], [role="slider"], [role="combobox"], [role="searchbox"], [role="textbox"], [role="separator"]';
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
        if ((o.overflowY === "auto" || o.overflowY === "scroll") && el.scrollWidth > el.clientWidth + 1 && el.getAttribute("data-scroll-x") === null) {
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
    for (const el of document.querySelectorAll("*")) {
      const o = getComputedStyle(el);
      if (o.overflowY !== "auto" && o.overflowY !== "scroll") continue;
      if (!shown(el) || el === document.documentElement || el === document.body) continue;
      const more = { top: el.scrollTop > 1, bottom: el.scrollTop + el.clientHeight < el.scrollHeight - 1 };
      const mask = o.maskImage && o.maskImage !== "none" ? o.maskImage : o.webkitMaskImage ?? "none";
      const f = String(v.fade);
      const has = {
        top: mask.startsWith(`linear-gradient(rgba(0, 0, 0, 0) 0px, rgb(0, 0, 0) ${f}px`),
        bottom: mask.includes(`rgb(0, 0, 0) calc(100% - ${f}px), rgba(0, 0, 0, 0) 100%)`),
      };
      for (const side of ["top", "bottom"] as const) {
        if (more[side] !== has[side]) out.push(`fading scroll edges: ${nameOf(el)} ${more[side] ? "has more to scroll to" : "has nothing more to scroll to"} at the ${side} but ${has[side] ? "fades it" : "doesn't fade it"} (mask: ${mask.slice(0, 120)})`);
      }
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
