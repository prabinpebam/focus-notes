/**
 * The Visual-vs-Verbose score's measurable criteria (D-127, documentations/design/visual-score.html)
 * on the setup screen, an onboarding step:
 * - **Visual anchor** (criterion 1): 20 for a non-text element of 48 px or more in view (the app's
 *   mark, a picture, an item card's icon tile), 10 for 24–47 px, otherwise 0.
 * - **Text economy** (criterion 4): 20 within the budget (40 words for an onboarding step), falling
 *   linearly to 0 at twice the budget; any paragraph over 2 lines caps it at 10. Only the interface's
 *   own words count: the person's data (their name and @login, a workspace's name, marked
 *   `data-personal`) doesn't.
 * Onboarding passes at 80 or more in total with no criterion below 10; the other three criteria are
 * judged by eye, from the screenshots. Light and dark are each measured; the lower counts.
 */
import type { Page } from "./fixtures.ts";

export const BUDGETS = { onboarding: 40, dialog: 60, popover: 60, panel: 80, settings: 80, empty: 30 } as const;
export const ANCHOR = { full: 48, half: 24 } as const;
export const LEAST = 10;

export interface VisualMeasure {
  /** The interface's own words shown. */
  words: number;
  /** The longest run of body text, in lines, and its start. */
  maxLines: number;
  longest: string;
  /** The largest non-text anchor in view, in px (its smaller side); 0 when there's none. */
  anchor: number;
}

/** Criterion 1, out of 20. */
export const anchorScore = (px: number) => (px >= ANCHOR.full ? 20 : px >= ANCHOR.half ? 10 : 0);
/** Criterion 4, out of 20. */
export function economyScore(words: number, maxLines: number, budget: number): number {
  const s = words <= budget ? 20 : Math.max(0, 20 * (1 - (words - budget) / budget));
  return Math.round(maxLines > 2 ? Math.min(10, s) : s);
}

/** Measures the setup screen (the `Set up Focus Notes` landmark) as it is now. */
export async function measureVisual(page: Page): Promise<VisualMeasure> {
  return page.evaluate(() => {
    const region = document.querySelector('[role="main"][aria-label="Set up Focus Notes"]') as HTMLElement | null;
    if (!region) return { words: 0, maxLines: 0, longest: "", anchor: 0 };
    const count = (t: string) => (t.match(/\S+/g) ?? []).length;
    const personal = [...region.querySelectorAll("[data-personal]")].reduce((n, el) => n + count((el as HTMLElement).innerText), 0);
    const words = count(region.innerText) - personal;
    let maxLines = 0, longest = "";
    // Body text: interface text runs and item card text (not headings or buttons).
    for (const el of region.querySelectorAll("span[dir=auto], [data-item-card] p, [data-item-card] span")) {
      if (el.closest("button, h1, h2, h3") || !(el as HTMLElement).innerText?.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(el);
      const lines = new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.bottom)));
      if (lines.size > maxLines) ((maxLines = lines.size), (longest = (el as HTMLElement).innerText.slice(0, 40)));
    }
    let anchor = 0;
    for (const el of region.querySelectorAll("[data-app-mark], [data-visual-anchor]")) {
      const r = el.getBoundingClientRect();
      if (r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth) anchor = Math.max(anchor, Math.min(r.width, r.height));
    }
    return { words, maxLines, longest, anchor: Math.round(anchor) };
  });
}

/** What fails the measurable criteria for an onboarding step (D-127), as lines for a problem list. */
export async function visualScoreProblems(page: Page, step: string, budget: number = BUDGETS.onboarding): Promise<string[]> {
  const m = await measureVisual(page);
  const a = anchorScore(m.anchor), e = economyScore(m.words, m.maxLines, budget);
  const out: string[] = [];
  if (a < LEAST) out.push(`${step}: visual anchor ${a}/20: the largest non-text element in view is ${m.anchor} px (24 px or more, 48 for full marks)`);
  if (e < LEAST) out.push(`${step}: text economy ${e}/20: ${m.words} words of the interface's (budget ${budget}), longest paragraph "${m.longest}…" ${m.maxLines} lines`);
  return out;
}

/**
 * D-126: Welcome is a full window, not a dialog: no border, shadow or radius on its surface, which
 * fills its layer (the window below the title bar band); the hero mark (96 px or more) and the
 * display title are in view and centred, and the content sits in the middle of the height.
 */
export async function welcomeProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const surface = document.querySelector('[data-key-scope="firstRun"]') as HTMLElement | null;
    const layer = surface?.closest('[role="main"]');
    if (!surface || !layer) return ["welcome: no setup surface"];
    const cs = getComputedStyle(surface);
    if (parseFloat(cs.borderTopWidth) || parseFloat(cs.borderLeftWidth)) out.push(`welcome: the surface has a border (${cs.borderTopWidth})`);
    if (cs.boxShadow && !/^(none|rgba\(0, 0, 0, 0\)( 0px)*)$/.test(cs.boxShadow)) out.push(`welcome: the surface has a shadow (${cs.boxShadow})`);
    if (parseFloat(cs.borderTopLeftRadius)) out.push(`welcome: the surface has a radius (${cs.borderTopLeftRadius})`);
    if (surface.hasAttribute("data-surface")) out.push(`welcome: the surface is drawn as a ${surface.getAttribute("data-surface")}`);
    const s = surface.getBoundingClientRect(), l = layer.getBoundingClientRect();
    if (Math.abs(s.width - l.width) > 1 || Math.abs(s.height - l.height) > 1) out.push(`welcome: the surface is ${Math.round(s.width)} × ${Math.round(s.height)}, not its whole layer (${Math.round(l.width)} × ${Math.round(l.height)})`);
    if (l.width < window.innerWidth * 0.9) out.push(`welcome: the setup is ${Math.round(l.width)} px wide in a ${window.innerWidth} px window`);
    const mid = s.left + s.width / 2;
    const check = (el: Element | null, what: string, least = 0) => {
      if (!el) return out.push(`welcome: no ${what}`);
      const r = el.getBoundingClientRect();
      if (r.width < least) out.push(`welcome: the ${what} is ${Math.round(r.width)} px (at least ${least})`);
      if (r.bottom <= s.top || r.top >= s.bottom) out.push(`welcome: the ${what} is out of view`);
      // Centred on the window, give or take the scrollbar's reserved gutter.
      if (Math.abs(r.left + r.width / 2 - mid) > 8) out.push(`welcome: the ${what} is ${Math.round(r.left + r.width / 2 - mid)} px off centre`);
    };
    check(surface.querySelector("[data-app-mark]"), "app's mark", 96);
    check(surface.querySelector("h1"), "title");
    const scroller = surface.firstElementChild as HTMLElement;
    const content = scroller.firstElementChild;
    if (content && scroller.scrollHeight <= scroller.clientHeight) {
      const c = content.getBoundingClientRect();
      const gap = c.top - s.top - (s.bottom - c.bottom);
      if (Math.abs(gap) > 8) out.push(`welcome: the content is ${Math.round(gap / 2)} px off the middle of the height`);
    }
    return out;
  });
}
