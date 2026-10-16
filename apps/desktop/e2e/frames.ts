/**
 * The frame-integrity recorder (DSK-09, D-148): every frame the page draws, through the DevTools
 * screencast of an inactive window, so it's safe on the owner's computer (no screen capture, no
 * focus). Each frame is checked against the theme palettes read from the built tokens, inside the
 * drawn window only (the shadow margin around it is see-through by design).
 */
import type { Page, CDPSession } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";

export type Rgb = [number, number, number];
export interface Frame { label: string; at: number; data: Buffer }
export interface Box { left: number; top: number; width: number; height: number }
export interface FrameProblem { label: string; frame: number; problem: string }

/** A small PNG reader: 8-bit RGB or RGBA, not interlaced (what Chromium's screencast sends). */
export function decodePng(buf: Buffer): { width: number; height: number; channels: number; pixels: Uint8Array } {
  let p = 8;
  let width = 0, height = 0, channels = 0;
  const idat: Buffer[] = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString("latin1", p + 4, p + 8);
    const body = buf.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      const depth = body[8], color = body[9], interlace = body[12];
      if (depth !== 8 || interlace !== 0 || (color !== 2 && color !== 6)) throw new Error(`Unsupported PNG (depth ${depth}, color ${color}, interlace ${interlace})`);
      channels = color === 6 ? 4 : 3;
    } else if (type === "IDAT") idat.push(body);
    else if (type === "IEND") break;
    p += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const src = y * (stride + 1) + 1;
    const row = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? out[row + x - channels]! : 0;
      const b = y > 0 ? out[row - stride + x]! : 0;
      const c = x >= channels && y > 0 ? out[row - stride + x - channels]! : 0;
      const v = raw[src + x]!;
      let pred = 0;
      if (filter === 1) pred = a;
      else if (filter === 2) pred = b;
      else if (filter === 3) pred = (a + b) >> 1;
      else if (filter === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[row + x] = (v + pred) & 0xff;
    }
  }
  return { width, height, channels, pixels: out };
}

const hex = (h: string): Rgb => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/**
 * The palettes of the default light and dark themes (Paper and Ink), from the built tokens: every
 * semantic color, and the large surfaces that would show if the other theme's frame leaked in.
 */
export interface Palette { all: Rgb[]; large: Rgb[]; scrimmed: Rgb[] }
export function themePalettes(): Record<"light" | "dark", Palette> {
  const css = readFileSync(join(import.meta.dirname, "..", "..", "..", "packages", "tokens", "dist", "tokens.css"), "utf8");
  const block = (selector: string) => {
    const i = css.indexOf(`${selector} {`);
    if (i < 0) throw new Error(`No ${selector} in tokens.css`);
    return css.slice(i, css.indexOf("}", i));
  };
  const vars = (text: string) => new Map([...text.matchAll(/(--fn-[\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
  const base = vars(block(":root"));
  const resolveIn = (own: Map<string, string>) => (name: string): string | undefined => {
    let v = own.get(name) ?? base.get(name);
    for (let i = 0; v && i < 8; i++) {
      const ref = /^var\((--fn-[\w-]+)\)$/.exec(v);
      if (!ref) break;
      v = own.get(ref[1]!) ?? base.get(ref[1]!);
    }
    return v && /^#[0-9a-f]{6}$/i.test(v) ? v : undefined;
  };
  // The scrim (`color.scrim`, an rgba colour) over a colour: what a modal's backdrop draws over the app.
  const scrimOf = (own: Map<string, string>): [Rgb, number] | undefined => {
    let v = own.get("--fn-color-scrim") ?? base.get("--fn-color-scrim");
    for (let i = 0; v && i < 8; i++) {
      const ref = /^var\((--fn-[\w-]+)\)$/.exec(v);
      if (!ref) break;
      v = own.get(ref[1]!) ?? base.get(ref[1]!);
    }
    const m = v && /^rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)$/.exec(v);
    return m ? [[Number(m[1]), Number(m[2]), Number(m[3])], Number(m[4])] : undefined;
  };
  const palette = (own: Map<string, string>) => {
    const r = resolveIn(own);
    const names = [...new Set([...base.keys(), ...own.keys()])].filter((n) => n.startsWith("--fn-color-") || n.startsWith("--fn-cmp-"));
    const all = names.map(r).filter((v): v is string => Boolean(v)).map(hex);
    const large = ["--fn-color-canvas", "--fn-color-surface", "--fn-color-surface-raised", "--fn-color-surface-sunken"].map(r).filter((v): v is string => Boolean(v)).map(hex);
    // Under a modal's scrim, once (a dialog) or twice (a confirmation over Settings): a steady frame, not a transition.
    const sc = scrimOf(own);
    const over = (c: Rgb): Rgb => (sc ? (c.map((x, k) => x * (1 - sc[1]) + sc[0][k]! * sc[1]) as Rgb) : c);
    const scrimmed = sc ? [...large.map(over), ...large.map((c) => over(over(c)))] : [];
    return { all, large, scrimmed };
  };
  return { light: palette(new Map()), dark: palette(vars(block(':root[data-theme="ink"]'))) };
}

/** Records every frame the page draws until `stop`; `mark` names the transition the next frames belong to. */
export async function recordFrames(page: Page): Promise<{ mark: (label: string) => void; stop: () => Promise<Frame[]>; cdp: CDPSession; restart: () => Promise<void> }> {
  const cdp = await page.context().newCDPSession(page);
  const frames: Frame[] = [];
  let label = "start";
  cdp.on("Page.screencastFrame", (f: { data: string; sessionId: number }) => {
    frames.push({ label, at: Date.now(), data: Buffer.from(f.data, "base64") });
    void cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "png", everyNthFrame: 1 });
  return {
    cdp,
    mark: (l) => void (label = l),
    /** Starts the screencast again, as a page loaded after a renderer crash needs. */
    restart: async () => {
      await cdp.send("Page.startScreencast", { format: "png", everyNthFrame: 1 });
    },
    stop: async () => {
      await cdp.send("Page.stopScreencast").catch(() => {});
      return frames;
    },
  };
}

export interface Shift { label: string; value: number; at: number; sources: string[] }
/**
 * Watches the page's layout shifts (PerformanceObserver 'layout-shift', from the start of the page),
 * each named by the transition it happened in. `shifts` returns those after the window's first frame
 * (`fn:window.firstFrame`) that no input caused and that move more than `min` of the page (DSK-09).
 */
export async function watchShifts(page: Page): Promise<{ mark: (label: string) => Promise<void>; shifts: (min?: number) => Promise<Shift[]> }> {
  await page.evaluate(() => {
    const g = globalThis as unknown as { __fnShifts?: { label: string; list: Shift[] } };
    if (g.__fnShifts) return;
    const state = { label: "launch", list: [] as Shift[] };
    g.__fnShifts = state;
    const describe = (n: Node | null | undefined, from?: DOMRectReadOnly, to?: DOMRectReadOnly) => {
      const move = from && to ? ` ${Math.round(from.x)},${Math.round(from.y)} ${Math.round(from.width)}x${Math.round(from.height)} → ${Math.round(to.x)},${Math.round(to.y)} ${Math.round(to.width)}x${Math.round(to.height)}` : "";
      if (!n || !(n instanceof Element)) return `${n?.nodeName ?? "?"}${move}`;
      const one = (e: Element) => {
        const name = e.getAttribute("aria-label") ?? e.getAttribute("role") ?? "";
        const data = [...e.attributes].filter((a) => a.name.startsWith("data-")).map((a) => a.name.slice(5)).join(",");
        return `${e.tagName.toLowerCase()}${e.id ? `#${e.id}` : ""}${name ? `[${name}]` : ""}${data ? `{${data}}` : ""}`;
      };
      const path: string[] = [];
      for (let e: Element | null = n; e && path.length < 4; e = e.parentElement) path.push(one(e));
      return `${path.join(" < ")} "${(n.textContent ?? "").trim().slice(0, 40)}"${move}`;
    };
    new PerformanceObserver((l) => {
      for (const e of l.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean; sources?: { node?: Node; previousRect: DOMRectReadOnly; currentRect: DOMRectReadOnly }[] })[]) {
        if (e.hadRecentInput) continue;
        state.list.push({ label: state.label, value: e.value, at: e.startTime, sources: (e.sources ?? []).map((s) => describe(s.node, s.previousRect, s.currentRect)) });
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
  return {
    mark: (label) => page.evaluate((l) => void ((globalThis as unknown as { __fnShifts: { label: string } }).__fnShifts.label = l), label),
    shifts: (min = 0.01) => page.evaluate((m) => {
      const first = performance.getEntriesByName("fn:window.firstFrame")[0]?.startTime ?? 0;
      return (globalThis as unknown as { __fnShifts: { list: Shift[] } }).__fnShifts.list.filter((s) => s.at > first && s.value > m);
    }, min),
  };
}

/**
 * With reduced motion, swaps are instant (D-148): watches every frame for an animation or transition
 * that runs for any time, by name and transition. The setting itself is checked by the caller.
 */
export async function watchMotion(page: Page): Promise<{ mark: (label: string) => Promise<void>; moving: () => Promise<string[]> }> {
  await page.evaluate(() => {
    const g = globalThis as unknown as { __fnMotion?: { label: string; seen: Set<string> } };
    if (g.__fnMotion) return;
    const state = { label: "start", seen: new Set<string>() };
    g.__fnMotion = state;
    const tick = () => {
      for (const a of document.getAnimations()) {
        const t = a.effect?.getComputedTiming();
        const duration = typeof t?.duration === "number" ? t.duration : 0;
        if (a.playState !== "running" || duration <= 0) continue;
        const target = (a.effect as KeyframeEffect | null)?.target;
        const what = a instanceof CSSTransition ? `transition ${a.transitionProperty}` : a instanceof CSSAnimation ? `animation ${a.animationName}` : "animation";
        state.seen.add(`${state.label}: ${what} ${duration}ms on ${target instanceof Element ? target.tagName.toLowerCase() + (target.className && typeof target.className === "string" ? "." + target.className.split(" ")[0] : "") : "?"}`);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  return {
    mark: (label) => page.evaluate((l) => void ((globalThis as unknown as { __fnMotion: { label: string } }).__fnMotion.label = l), label),
    moving: () => page.evaluate(() => [...(globalThis as unknown as { __fnMotion: { seen: Set<string> } }).__fnMotion.seen]),
  };
}

/**
 * A frame's main colour (each channel within 6 of it, the screencast's 6-bit bucket) that is in no
 * theme: neither one of a theme's large surfaces (canvas, surface, raised, sunken), which is what
 * covers most of a steady frame, nor one under a modal's scrim, once or twice. A cross-fade between two
 * themes, or a fading element, draws such blends; a steady frame doesn't (D-148, reduced motion).
 */
export function midTransition(rgb: Rgb, pal: Record<"light" | "dark", Palette> = themePalettes()): boolean {
  const [r, g, b] = rgb;
  return ![pal.light, pal.dark].some((p) => [...p.large, ...p.scrimmed].some((c) => near(r, g, b, c, 6)));
}

const near = (r: number, g: number, b: number, c: Rgb, d: number) => Math.abs(r - c[0]) <= d && Math.abs(g - c[1]) <= d && Math.abs(b - c[2]) <= d;

/**
 * Each frame, inside the drawn window (`box`, in CSS pixels of a `viewport` wide page): fails when 2%
 * or more of it is see-through or the other theme's surfaces (white in a dark frame), or when it's
 * blank, one color through and through, while a transition is in flight.
 */
export function frameProblems(frames: Frame[], box: Box, viewportWidth: number, schemeOf: (label: string) => "light" | "dark" | "either", opts: { instant?: boolean } = {}): FrameProblem[] {
  const pal = themePalettes();
  const out: FrameProblem[] = [];
  const kinds = new Map<number, number>();
  frames.forEach((f, i) => {
    let png;
    try {
      png = decodePng(f.data);
    } catch (e) {
      out.push({ label: f.label, frame: i, problem: String(e) });
      return;
    }
    const scale = png.width / viewportWidth;
    const x0 = Math.max(0, Math.round(box.left * scale)), y0 = Math.max(0, Math.round(box.top * scale));
    const x1 = Math.min(png.width, Math.round((box.left + box.width) * scale)), y1 = Math.min(png.height, Math.round((box.top + box.height) * scale));
    // Every other pixel each way: a fourth of them is plenty for areas of 2%.
    let total = 0, seeThrough = 0, lightLarge = 0, darkLarge = 0;
    const counts = new Map<number, number>();
    for (let y = y0; y < y1; y += 2) {
      for (let x = x0; x < x1; x += 2) {
        const o = (y * png.width + x) * png.channels;
        const r = png.pixels[o]!, g = png.pixels[o + 1]!, b = png.pixels[o + 2]!;
        const a = png.channels === 4 ? png.pixels[o + 3]! : 255;
        total++;
        if (a < 250) {
          seeThrough++;
          continue;
        }
        const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
        counts.set(key, (counts.get(key) ?? 0) + 1);
        const rgb = (r << 16) | (g << 8) | b;
        let k = kinds.get(rgb);
        if (k === undefined) {
          // 1: a light theme's large surface that's in no dark color; 2: the other way round.
          const inLight = pal.light.all.some((c) => near(r, g, b, c, 10));
          const inDark = pal.dark.all.some((c) => near(r, g, b, c, 10));
          k = (!inDark && pal.light.large.some((c) => near(r, g, b, c, 3)) ? 1 : 0) | (!inLight && pal.dark.large.some((c) => near(r, g, b, c, 3)) ? 2 : 0);
          kinds.set(rgb, k);
        }
        if (k & 1) lightLarge++;
        if (k & 2) darkLarge++;
      }
    }
    if (!total) return;
    const pct = (n: number) => (100 * n) / total;
    // The theme the frame must be in; while the theme changes, either one, but never both at once.
    const scheme = schemeOf(f.label);
    const wrong = scheme === "dark" ? lightLarge : scheme === "light" ? darkLarge : Math.min(lightLarge, darkLarge);
    if (pct(seeThrough) >= 2) out.push({ label: f.label, frame: i, problem: `${pct(seeThrough).toFixed(1)}% of the window is see-through` });
    if (pct(wrong) >= 2) out.push({ label: f.label, frame: i, problem: scheme === "either" ? `${pct(wrong).toFixed(1)}% of the window is in the other theme (a frame mixing both)` : `${pct(wrong).toFixed(1)}% of the window is outside the ${scheme} theme's palette (${scheme === "dark" ? "white or light surfaces" : "dark surfaces"})` });
    const top = Math.max(0, ...counts.values());
    if (pct(top) >= 99.9) out.push({ label: f.label, frame: i, problem: `the window is blank (${pct(top).toFixed(1)}% one color)` });
    if (opts.instant) {
      // With reduced motion, a swap is instant: the window's main colour is always one of a theme's own, never a blend of two.
      const key = [...counts].find(([, n]) => n === top)?.[0] ?? 0;
      const [r, g, b] = [((key >> 12) & 63) << 2, ((key >> 6) & 63) << 2, (key & 63) << 2];
      if (midTransition([r + 2, g + 2, b + 2], pal)) out.push({ label: f.label, frame: i, problem: `the frame is mid-transition (its main colour rgb(${r}, ${g}, ${b}) is in no theme)` });
    }
  });
  return out;
}
