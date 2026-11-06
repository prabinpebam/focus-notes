// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { afterFirstThemedFrame, bootTheme } from "../src/behaviors/boot.ts";

const fakeHtml = () => ({ dataset: {} as Record<string, string>, style: {} as Record<string, string> });
const boot = (search: string) => {
  const html = fakeHtml();
  bootTheme(search, html as unknown as HTMLElement);
  return html;
};

describe("DSK-09, D-148: the page's first frame is in its theme", () => {
  it("applies the theme and scheme from the page's address before anything renders", () => {
    const h = boot("?platform=windows&theme=ink&scheme=dark");
    expect(h.dataset.theme).toBe("ink");
    expect(h.style.colorScheme).toBe("dark");
    expect(h.dataset.windowFrame).toBeUndefined();
  });
  it("turns on the contrast mode for a High contrast theme", () => {
    expect(boot("?theme=contrast-dark&scheme=dark").dataset.themeContrast).toBe("high");
  });
  it("ignores anything that isn't a theme's id or a scheme", () => {
    const h = boot("?theme=%3Cscript%3E&scheme=purple");
    expect(h.dataset.theme).toBeUndefined();
    expect(h.style.colorScheme).toBeUndefined();
  });
  it("draws the app-built window's shape from the first frame: rounded at rest, square maximized or opaque", () => {
    const w = (o: object) => `?theme=paper&window=${encodeURIComponent(JSON.stringify(o))}`;
    expect(boot(w({ frame: "custom" })).dataset.windowFrame).toBe("rounded");
    expect(boot(w({ frame: "custom", maximized: true })).dataset.windowFrame).toBe("square");
    expect(boot(w({ frame: "opaque" })).dataset.windowFrame).toBe("square");
    expect(boot("?theme=paper&window=%7Bbroken").dataset.windowFrame).toBeUndefined();
  });
  it("waits for two consecutive frames in the requested boot theme, not a temporary app default", async () => {
    const html = document.documentElement;
    const before = html.dataset.theme;
    const root = document.createElement("div");
    root.setAttribute("data-app-root", "");
    document.body.append(root);
    const frames: FrameRequestCallback[] = [];
    const raf = vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation(callback => { frames.push(callback); return frames.length; });
    try {
      html.dataset.theme = "paper";
      let drawn = false;
      void afterFirstThemedFrame(1500, html, "ink").then(() => { drawn = true; });
      for (const [theme, expected] of [["paper", false], ["ink", false], ["paper", false], ["ink", false], ["ink", true]] as const) {
        html.dataset.theme = theme;
        frames.shift()!(performance.now());
        await Promise.resolve();
        expect(drawn).toBe(expected);
      }
    } finally {
      raf.mockRestore();
      root.remove();
      if (before === undefined) delete html.dataset.theme;
      else html.dataset.theme = before;
    }
  });
});
