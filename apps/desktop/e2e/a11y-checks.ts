/**
 * Checks the accessibility audit runs in every surface (A11Y-01): target size (WCAG 2.5.8) and a
 * visible, uncovered focus (2.4.7, 2.4.11). Shared by the desktop and web journeys.
 */
import type { Page } from "@playwright/test";

/** Interactive elements a pointer can hit, outside the note's own text. */
const TARGETS = 'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role^="menuitem"], [role="option"], [role="treeitem"], [role="radio"], [role="tab"], [role="checkbox"], [role="switch"], [role="slider"]';

/** 2.5.8: each target is 24 × 24 px or more, or a 24 px circle on it touches no other target. */
export const smallTargets = (page: Page) => page.evaluate((selector) => {
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    // Visually hidden controls for screen readers (React Aria's Dismiss) aren't pointer targets.
    let clipped = false;
    for (let n: Element | null = el; n && !clipped; n = n.parentElement) {
      const c = getComputedStyle(n);
      clipped = c.clipPath === "inset(50%)" || c.clip === "rect(0px, 0px, 0px, 0px)";
    }
    return r.width > 0 && r.height > 0 && !clipped && cs.visibility !== "hidden" && cs.pointerEvents !== "none" && Number(cs.opacity) > 0 && !el.closest("[inert], [aria-hidden='true']");
  };
  const all = [...document.querySelectorAll(selector)].filter((el) => visible(el) && !el.closest("[data-editor]"));
  // Nested targets (a menu item's own pieces) count as their outermost one.
  const targets = all.filter((el) => !all.some((o) => o !== el && o.contains(el)));
  const rects = targets.map((el) => el.getBoundingClientRect());
  const bad: string[] = [];
  targets.forEach((el, i) => {
    const r = rects[i]!;
    if (r.width >= 23.5 && r.height >= 23.5) return;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const clash = rects.some((o, j) => {
      if (j === i) return false;
      // Distance from the circle's center to the other target's box, and to its own circle.
      const dx = Math.max(o.left - cx, 0, cx - o.right), dy = Math.max(o.top - cy, 0, cy - o.bottom);
      const small = o.width < 23.5 || o.height < 23.5;
      const ox = o.left + o.width / 2, oy = o.top + o.height / 2;
      return Math.hypot(dx, dy) < 12 || (small && Math.hypot(ox - cx, oy - cy) < 24);
    });
    if (clash) bad.push(`${el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 30) ?? el.tagName} ${Math.round(r.width)}×${Math.round(r.height)}`);
  });
  return bad;
}, TARGETS);

/** 2.4.7 and 2.4.11: the focused control shows an indicator, and nothing covers it. */
export const focusProblem = (page: Page) => page.evaluate(() => {
  const el = document.activeElement as HTMLElement | null;
  if (!el || el === document.body) return "nothing has focus";
  // Text entry shows its caret; the note and fields are checked for being visible only.
  const textEntry = el.hasAttribute("data-editor") || el.matches("input, textarea");
  const cs = getComputedStyle(el);
  const ring = cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) >= 2;
  const shadow = cs.boxShadow !== "none" && /\d+px/.test(cs.boxShadow);
  const tinted = el.matches('[role^="menuitem"], [role="option"], [role="treeitem"]') && cs.backgroundColor !== "rgba(0, 0, 0, 0)";
  if (!textEntry && !ring && !shadow && !tinted) return `${el.getAttribute("aria-label") ?? el.tagName} has no focus indicator`;
  const r = el.getBoundingClientRect();
  const x = Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1), y = Math.min(Math.max(r.top + Math.min(r.height / 2, 10), 0), innerHeight - 1);
  if (r.bottom < 0 || r.top > innerHeight) return `${el.getAttribute("aria-label") ?? el.tagName} is off screen`;
  const hit = document.elementFromPoint(x, y);
  // A box that paints nothing (the window's invisible title bar band, D-104) hides nothing under it.
  const seeThrough = (n: Element) => {
    const c = getComputedStyle(n);
    const clear = (v: string) => v === "transparent" || /rgba\(.*,\s*0\)$/.test(v);
    return clear(c.backgroundColor) && c.backgroundImage === "none" && c.boxShadow === "none" && c.backdropFilter === "none"
      && ["Top", "Right", "Bottom", "Left"].every((side) => parseFloat(c.getPropertyValue(`border-${side.toLowerCase()}-width`)) === 0 || clear(c.getPropertyValue(`border-${side.toLowerCase()}-color`)))
      && ![...n.childNodes].some((t) => t.nodeType === Node.TEXT_NODE && t.textContent?.trim());
  };
  const cover = hit && seeThrough(hit) ? document.elementsFromPoint(x, y).find((n) => !seeThrough(n) || n.contains(el) || el.contains(n)) ?? hit : hit;
  if (cover && !el.contains(cover) && !cover.contains(el) && !(textEntry && el.contains(cover))) {
    // Covered only if the thing on top isn't part of the same popup or a tooltip about it.
    if (!cover.closest('[role="tooltip"]')) return `${el.getAttribute("aria-label") ?? el.tagName} is covered by ${cover.getAttribute("aria-label") ?? cover.tagName}`;
  }
  return "";
});
