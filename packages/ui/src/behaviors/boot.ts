/**
 * The page's first frame, in its theme (DSK-09, D-148). The desktop's main process resolves the theme
 * before the page loads and passes it in the page's address (`theme`, `scheme`, and the drawn
 * window's state). Applied before anything renders, the boot styles (the body's canvas in AppRoot,
 * the tokens of that theme) paint the right colors from the first frame, never Chromium's white.
 * AppRoot keeps them from then on.
 */
const THEME_ID = /^[a-z][a-z0-9-]{0,40}$/;

export function bootTheme(search: string, html: HTMLElement = document.documentElement): void {
  const p = new URLSearchParams(search);
  const theme = p.get("theme");
  const scheme = p.get("scheme");
  if (theme && THEME_ID.test(theme)) {
    html.dataset.theme = theme;
    if (theme.startsWith("contrast-")) html.dataset.themeContrast = "high";
  }
  if (scheme === "light" || scheme === "dark") html.style.colorScheme = scheme;
  // The app-built window (D-14): the page around it is transparent from the first frame too.
  try {
    const w = JSON.parse(p.get("window") ?? "null") as { frame?: unknown; maximized?: unknown; snapped?: unknown; fullScreen?: unknown } | null;
    if (w && (w.frame === "custom" || w.frame === "opaque")) html.dataset.windowFrame = w.frame === "custom" && !w.maximized && !w.snapped && !w.fullScreen ? "rounded" : "square";
  } catch {
    // Not a drawn window.
  }
}

/**
 * Resolves once the app's layout is drawn in the theme the page was asked for (or `maxMs` passed):
 * the moment the desktop window may show (`fn:window.firstFrame`).
 */
export function afterFirstThemedFrame(maxMs = 1500, html: HTMLElement = document.documentElement): Promise<void> {
  const wanted = html.dataset.theme;
  const started = performance.now();
  return new Promise((resolve) => {
    const tick = () => {
      const drawn = Boolean(document.querySelector("[data-app-root]")) && (!wanted || html.dataset.theme === wanted);
      if (drawn || performance.now() - started > maxMs) {
        // One more frame: the one with the layout is then on screen.
        requestAnimationFrame(() => resolve());
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
