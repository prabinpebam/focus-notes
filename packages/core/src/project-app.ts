import type { AppState, App } from "./app.ts";
import type { AppStateFile } from "./bridge.ts";
import type { MessageCatalog } from "./messages.ts";
import { BUILT_IN_THEMES, CONTENT_FONTS, themeById } from "./themes.ts";
import { themeTilesOf } from "./theme-manager-app.ts";

export const PROJECT_ACCENTS = ["red", "orange", "amber", "lime", "green", "teal", "cyan", "blue", "indigo", "violet", "pink", "slate"];
export const PROJECT_LOGOS = ["book", "briefcase", "beaker", "heart", "star", "leaf", "rocket", "lightbulb", "music", "camera", "people", "home", "airplane", "code", "brush", "trophy", "earth", "food", "building", "chat", "diamond", "flag", "sparkle", "pen"];
export interface ProjectSettings {
  name: string;
  accent: string;
  logo: string;
  watermark: "off" | "on";
  font: string;
  theme: string;
}

export function registerProject(ctx: {
  store: App["store"]; commands: App["commands"]; viewModels: App["viewModels"]; catalog: MessageCatalog;
  appState: () => AppStateFile; persistAppState: (patch: Partial<AppStateFile>) => Promise<void>;
}) {
  const { store, commands, viewModels, catalog } = ctx;
  const transient = { fontOpen: "no", themeOpen: "no", fontHover: "", themeHover: "" };
  const folder = () => store.state.workspace.folder ?? "";
  const settings = (): ProjectSettings => ctx.appState().projectSettings?.[folder()] ?? {
    name: folder().split(/[\\/]/).filter(Boolean).at(-1) ?? catalog.format("project.settings.title"),
    accent: "teal", logo: "book", watermark: "off", font: "app", theme: "app",
  };
  const changed = () => store.update((state) => ({ ...state }));
  const reg = (field: string) => commands.register<{ value: unknown }>({
    id: `project.${field}`, title: "project.settings.title",
    run: async ({ value }) => {
      if (field in transient) {
        if (typeof value !== "string") throw new Error("Invalid project preview");
        Object.assign(transient, { [field]: value });
        changed();
        return;
      }
      if (!folder()) throw new Error("No project is open");
      if (typeof value !== "string") throw new Error("Invalid project setting");
      const allowed: Record<string, readonly string[]> = {
        accent: PROJECT_ACCENTS, logo: PROJECT_LOGOS, watermark: ["off", "on"], font: ["app", ...CONTENT_FONTS], theme: ["app", ...BUILT_IN_THEMES.map((theme) => theme.id)],
      };
      if (field !== "name" && !allowed[field]?.includes(value)) throw new Error("Invalid project setting");
      const next = { ...settings(), [field]: value };
      await ctx.persistAppState({ projectSettings: { ...ctx.appState().projectSettings, [folder()]: next } });
      if (field === "font" || field === "theme") Object.assign(transient, { [`${field}Open`]: "no", [`${field}Hover`]: "" });
      changed();
    },
  });
  for (const field of ["name", "accent", "logo", "watermark", "font", "theme", ...Object.keys(transient)]) reg(field);
  commands.register({
    id: "project.settings", title: "project.settings.title", group: "app",
    run: async () => { await commands.run("settings.setSection", { value: "project" }); await commands.run("settings.open"); },
  });
  const text = { type: "string" as const };
  const option = { type: "object" as const, properties: { id: text, label: text } };
  viewModels.register({
    id: "vm.project", reads: "*",
    setters: Object.fromEntries(["name", "accent", "logo", "watermark", "font", "theme", ...Object.keys(transient)].map((field) => [field, `project.${field}`])),
    schema: { type: "object", properties: {
      available: { type: "boolean" }, watermarkOn: { type: "boolean" },
      ...Object.fromEntries(["name", "accent", "logo", "watermark", "font", "theme", "fontValue", "themeValue", "scopeFont", "scopeTheme", ...Object.keys(transient)].map((field) => [field, text])),
      accents: { type: "array", items: option }, logos: { type: "array", items: option },
      fonts: { type: "array", items: option }, watermarkOptions: { type: "array", items: option },
      themeTiles: { type: "array", items: { type: "object", properties: {
        id: text, label: text, kind: text, slot: text, badge: text, description: text, group: text, sample: text,
        colors: { type: "array", items: { type: "object", properties: { id: text, value: text } } },
      } } },
    } },
    select: (state: AppState) => {
      const current = settings();
      return {
        ...current, ...transient, available: Boolean(folder()), watermarkOn: current.watermark === "on",
        scopeFont: transient.fontHover || current.font, scopeTheme: transient.themeHover || current.theme,
        fontValue: catalog.format(current.font === "app" ? "project.appDefault" : `font.${current.font}`),
        themeValue: catalog.format(current.theme === "app" ? "project.appDefault" : themeById(current.theme)?.title ?? "project.appDefault"),
        accents: PROJECT_ACCENTS.map((id) => ({ id, label: catalog.format(`project.colour.${id}`) })),
        logos: PROJECT_LOGOS.map((id) => ({ id, label: catalog.format(`project.logo.${id}`) })),
        fonts: CONTENT_FONTS.map((id) => ({ id, label: catalog.format(`font.${id}`) })),
        watermarkOptions: ["off", "on"].map((id) => ({ id, label: catalog.format(`project.watermark.${id}`) })),
        themeTiles: themeTilesOf(state.appearance, state.ui.theme.draft, catalog).filter((tile) => themeById(tile.id)),
      };
    },
  });
}
