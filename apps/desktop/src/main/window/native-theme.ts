/**
 * macOS's native parts follow the app's own appearance, not the system's (D-204): the right-click
 * menu in text is the system's menu there, so it's drawn light or dark as the app is. Elsewhere the
 * app draws its menus itself, and the native theme stays the system's.
 */
export type ThemeSource = "light" | "dark" | "system";

export function themeSourceFor(platform: "macos" | "windows" | "linux", appearance: unknown): ThemeSource {
  if (platform !== "macos") return "system";
  return appearance === "light" || appearance === "dark" ? appearance : "system";
}
