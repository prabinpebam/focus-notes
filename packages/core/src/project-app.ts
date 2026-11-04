import type { AppState, App } from "./app.ts";
import type { AppStateFile, PlatformBridge } from "./bridge.ts";
import type { MessageCatalog } from "./messages.ts";
import { BUILT_IN_THEMES, CONTENT_FONTS, themeById } from "./themes.ts";
import { themeTilesOf } from "./theme-manager-app.ts";

export const PROJECT_ACCENTS = ["red", "orange", "amber", "lime", "green", "teal", "cyan", "blue", "indigo", "violet", "pink", "slate"];
export const PROJECT_LOGOS = ["book", "briefcase", "beaker", "heart", "star", "leaf", "rocket", "lightbulb", "music", "camera", "people", "home", "airplane", "code", "brush", "trophy", "earth", "food", "building", "chat", "diamond", "flag", "sparkle", "pen"];
export interface ProjectSettings {
  name: string;
  accent: string;
  logo: string;
  logoSrc?: string;
  watermark: "off" | "on";
  font: string;
  theme: string;
}

export function registerProject(ctx: {
  store: App["store"]; commands: App["commands"]; viewModels: App["viewModels"]; catalog: MessageCatalog;
  appState: () => AppStateFile; persistAppState: (patch: Partial<AppStateFile>) => Promise<void>;
  bridge: PlatformBridge;
}) {
  const { store, commands, viewModels, catalog } = ctx;
  const transient = { fontOpen: "no", themeOpen: "no", fontHover: "", themeHover: "", uploadError: "" };
  let selectingLogo = false;
  const folder = () => store.state.workspace.folder ?? "";
  const settings = (): ProjectSettings => ctx.appState().projectSettings?.[folder()] ?? {
    name: folder().split(/[\\/]/).filter(Boolean).at(-1) ?? catalog.format("project.settings.title"),
    accent: "teal", logo: "book", watermark: "off", font: "app", theme: "app",
  };
  const changed = () => store.update((state) => ({ ...state }));
  let writing = Promise.resolve();
  const save = (patch: Partial<ProjectSettings>) => {
    const key = folder();
    const fallback = settings();
    const write = writing.then(() => ctx.persistAppState({
      projectSettings: { ...ctx.appState().projectSettings, [key]: { ...(ctx.appState().projectSettings?.[key] ?? fallback), ...patch } },
    }));
    writing = write.then(() => {}, () => {});
    return write;
  };
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
      try {
        await save({ [field]: value });
      } finally {
        if (field === "font" || field === "theme") Object.assign(transient, { [`${field}Open`]: "no", [`${field}Hover`]: "" });
        changed();
      }
    },
  });
  for (const field of ["name", "accent", "logo", "watermark", "font", "theme", ...Object.keys(transient)]) reg(field);
  const logoCommit = () => store.state.commits.find((item) => item.target === "vm.project.logo");
  const uploadSource = (value: unknown) => {
    if (!value || typeof value !== "object" || !("logoSrc" in value) || typeof value.logoSrc !== "string"
      || !("folder" in value) || value.folder !== folder()) throw new Error("The logo belongs to another project");
    return value.logoSrc;
  };
  commands.register<{ value: unknown }>({
    id: "project.logoUpload", title: "project.settings.upload",
    run: async ({ value }) => {
      await save({ logo: "upload", logoSrc: uploadSource(value) });
      changed();
    },
  });
  const retryLogo = async () => {
    const commit = logoCommit();
    if (!commit || commit.phase !== "failed") throw new Error("No failed logo change to retry");
    try {
      await commands.run("commit.run", { target: commit.target, command: commit.command, value: commit.value, label: catalog.format("project.settings.logo") });
    } catch (error) {
      if (logoCommit()?.phase !== "failed") throw error;
      console.error("Project logo commit failed", error);
    }
  };
  commands.register({ id: "project.logoRetry", title: "commit.retry", run: retryLogo });
  commands.register({
    id: "project.upload", title: "project.settings.upload", enabled: () => Boolean(ctx.bridge.projects),
    run: async () => {
      if (selectingLogo || logoCommit()?.phase === "pending") return;
      const key = folder();
      if (!key) throw new Error("No project is open");
      selectingLogo = true;
      transient.uploadError = ""; changed();
      try {
        const logoSrc = await ctx.bridge.projects!.upload();
        if (logoSrc === undefined) return;
        if (key !== folder()) throw new Error("The project changed while choosing a logo");
        await commands.run("commit.run", {
          target: "vm.project.logo", command: "project.logoUpload", value: { folder: key, logoSrc },
          label: catalog.format("project.settings.logo"),
        });
      } catch (error) {
        console.error("Project logo upload failed", error);
        if (logoCommit()?.phase !== "failed") transient.uploadError = catalog.format("project.settings.uploadFailed");
      } finally {
        selectingLogo = false;
        changed();
      }
    },
  });
  commands.register({
    id: "project.settings", title: "project.settings.title", group: "app",
    run: async () => { await commands.run("settings.setSection", { value: "project" }); await commands.run("settings.open"); },
  });
  const text = { type: "string" as const };
  const option = { type: "object" as const, properties: { id: text, label: text } };
  const choiceFields = ["accent", "logo", "font", "theme"] as const;
  viewModels.register({
    id: "vm.project", reads: "*",
    setters: Object.fromEntries(["name", "accent", "logo", "watermark", "font", "theme", ...Object.keys(transient)].map((field) => [field, `project.${field}`])),
    commits: ["name", "accent", "logo", "watermark", "font", "theme"],
    schema: { type: "object", properties: {
      available: { type: "boolean" }, local: { type: "boolean" }, watermarkOn: { type: "boolean" },
      uploadChoosing: { type: "boolean" }, uploadFailed: { type: "boolean" },
      uploadCommit: { type: "string", enum: ["rest", "pending", "confirmed", "failed"] },
      uploadSrc: text, logoError: text,
      ...Object.fromEntries(["name", "accent", "logo", "logoSrc", "watermark", "font", "theme", "fontValue", "themeValue", "scopeFont", "scopeTheme", "filesHeading", ...Object.keys(transient)].map((field) => [field, text])),
      accents: { type: "array", items: option }, logos: { type: "array", items: option },
      fonts: { type: "array", items: option }, watermarkOptions: { type: "array", items: option },
      themeTiles: { type: "array", items: { type: "object", properties: {
        id: text, label: text, kind: text, slot: text, badge: text, description: text, group: text, sample: text,
        colors: { type: "array", items: { type: "object", properties: { id: text, value: text } } },
      } } },
      ...Object.fromEntries(choiceFields.flatMap((field) => [
        [`${field}Commit`, { type: "string" as const, enum: ["rest", "pending", "confirmed", "failed"] }],
        [`${field}Choice`, text], [`${field}Failed`, { type: "boolean" as const }],
      ])),
    } },
    select: (state: AppState) => {
      const current = settings();
      const choiceOf = (field: typeof choiceFields[number]) => {
        const commit = state.commits.find((item) => item.target === `vm.project.${field}`);
        return {
          phase: commit?.phase ?? "rest",
          value: commit && commit.phase !== "confirmed" ? typeof commit.value === "string" ? commit.value : field === "logo" ? "upload" : current[field] : current[field],
          failed: commit?.phase === "failed",
        };
      };
      const choices = Object.fromEntries(choiceFields.flatMap((field) => {
        const choice = choiceOf(field);
        return [
          [`${field}Commit`, choice.phase], [`${field}Choice`, choice.value], [`${field}Failed`, choice.failed],
        ];
      }));
      const fontChoice = choiceOf("font").value;
      const themeChoice = choiceOf("theme").value;
      const logo = logoCommit();
      const uploaded = logo?.command === "project.logoUpload";
      const source = uploaded && logo.value && typeof logo.value === "object" && "logoSrc" in logo.value && typeof logo.value.logoSrc === "string" ? logo.value.logoSrc : current.logoSrc ?? "";
      return {
        ...current, ...transient, ...choices, local: Boolean(ctx.bridge.projects?.local), available: Boolean(folder()) && !ctx.bridge.projects?.local, watermarkOn: current.watermark === "on" && !ctx.bridge.projects?.local,
        uploadChoosing: selectingLogo, uploadFailed: Boolean(transient.uploadError),
        uploadCommit: selectingLogo || logo?.phase === "pending" && uploaded ? "pending" : uploaded ? logo.phase : "rest",
        uploadSrc: source, logoError: catalog.format(uploaded ? "project.settings.uploadSaveFailed" : "commit.choiceFailed"),
        accent: ctx.bridge.projects?.local ? "app" : current.accent,
        filesHeading: catalog.format(ctx.bridge.projects?.local ? "quick.title" : "files.heading"),
        scopeFont: transient.fontHover || current.font, scopeTheme: transient.themeHover || current.theme,
        fontValue: catalog.format(fontChoice === "app" ? "project.appDefault" : `font.${fontChoice}`),
        themeValue: catalog.format(themeChoice === "app" ? "project.appDefault" : themeById(themeChoice)?.title ?? "project.appDefault"),
        accents: PROJECT_ACCENTS.map((id) => ({ id, label: catalog.format(`project.colour.${id}`) })),
        logos: PROJECT_LOGOS.map((id) => ({ id, label: catalog.format(`project.logo.${id}`) })),
        fonts: CONTENT_FONTS.map((id) => ({ id, label: catalog.format(`font.${id}`) })),
        watermarkOptions: ["off", "on"].map((id) => ({ id, label: catalog.format(`project.watermark.${id}`) })),
        themeTiles: themeTilesOf(state.appearance, state.ui.theme.draft, catalog).filter((tile) => themeById(tile.id)),
      };
    },
  });
}
