/**
 * D-430: the website's look, Settings → Sharing → Site appearance. One theme and one font per project, from the
 * app's own themes and bundled fonts, used by the published pages (n/) and the shared notes' page (s/) alike.
 * A change saves the look and rebuilds the one public site (D-429) with D-427's steps; a failure keeps the
 * choice, names its step and offers Retry, and the website keeps its old look until it finishes.
 */
import type { AppState } from "./app.ts";
import type { CommandRegistry } from "./commands.ts";
import type { MessageCatalog } from "./messages.ts";
import type { Store } from "./store.ts";
import type { TaskTracker } from "./tasks.ts";
import type { ViewModelRegistry } from "./view-models.ts";
import { opErrorCode } from "./bridge.ts";
import { sharingAvailable, type AccessBridge, type SiteAppearance, type SiteAppearanceState } from "./share-manage.ts";
import { shareProgress, shareProgressView } from "./share-progress.ts";

export const SITE_THEMES = ["paper", "sepia", "ink", "dusk"] as const;
export const SITE_FONTS = ["serif", "sans", "hyperlegible"] as const;
export const SITE_APPEARANCE_DEFAULT: SiteAppearance = { theme: "paper", font: "serif" };
const IDLE: SiteAppearanceState = { ...SITE_APPEARANCE_DEFAULT, busy: false, problem: "", loaded: "" };

export const isSiteAppearance = (v: unknown): v is SiteAppearance => typeof v === "object" && v !== null
  && (SITE_THEMES as readonly unknown[]).includes((v as SiteAppearance).theme) && (SITE_FONTS as readonly unknown[]).includes((v as SiteAppearance).font);

export function registerSiteAppearance({ store, catalog, commands, viewModels, tracker, access, toast }: {
  store: Store<AppState>; catalog: MessageCatalog; commands: CommandRegistry<AppState>; viewModels: ViewModelRegistry<AppState>;
  tracker: TaskTracker; access?: AccessBridge; toast: (message: string, opts?: { tone?: "success" | "error" }) => unknown;
}) {
  const get = () => store.state.ui.share.appearance ?? IDLE;
  const set = (patch: Partial<SiteAppearanceState>) => store.update(s => ({
    ...s, ui: { ...s.ui, share: { ...s.ui.share, appearance: { ...(s.ui.share.appearance ?? IDLE), ...patch } } },
  }));
  const progress = shareProgress(store);
  const live = () => sharingAvailable(store.state) && !store.state.ui.share.listing?.localReview && Boolean(access?.setSiteAppearance);
  const projectKey = () => `${store.state.workspace.folder ?? ""}:${store.state.ui.share.listing?.site ?? ""}`;

  // The saved look is read once per project and site, when sharing is on there.
  store.subscribe(() => {
    if (!live() || get().loaded === projectKey() || get().busy) return;
    const key = projectKey();
    set({ ...SITE_APPEARANCE_DEFAULT, loaded: key, problem: "" });
    void access!.siteAppearance?.().then(saved => {
      if (projectKey() === key && saved && isSiteAppearance(saved) && !get().busy) set({ theme: saved.theme, font: saved.font });
    }, error => console.error("Site appearance read failed", opErrorCode(error)));
  });

  const apply = async (look: SiteAppearance) => {
    if (get().busy || !live()) return;
    set({ ...look, busy: true, problem: "" });
    progress.start("look");
    const off = access!.setup?.onStep?.(step => progress.step(step));
    try {
      await tracker.run("sharing.appearance", "share.progress.look.update.line", async () => {
        progress.step("save");
        await access!.setSiteAppearance!(look);
      }, undefined, "fn:sharing.appearance", "none");
      progress.clear();
      toast(catalog.format("site.appearance.done"), { tone: "success" });
    } catch (error) {
      console.error("Site appearance change failed", opErrorCode(error));
      progress.fail();
      const pages = /sharing:pages/.test(error instanceof Error ? error.message : String(error));
      set({ problem: `${shareProgressView(progress.get(), catalog, 0).failedStep} ${catalog.format(pages ? "site.appearance.failed" : "site.appearance.problem")}` });
    } finally { off?.(); set({ busy: false }); }
  };
  const reg = <A extends Record<string, unknown>>(id: string, run: (args: A) => void | Promise<void>) =>
    commands.register<A>({ id, title: "site.appearance.title", run });
  reg<{ value: string }>("sharing.appearance.theme", ({ value }) => {
    if (!(SITE_THEMES as readonly string[]).includes(value)) throw new Error("Invalid site theme");
    if (value !== get().theme || get().problem) return apply({ theme: value, font: get().font });
  });
  reg<{ value: string }>("sharing.appearance.font", ({ value }) => {
    if (!(SITE_FONTS as readonly string[]).includes(value)) throw new Error("Invalid site font");
    if (value !== get().font || get().problem) return apply({ theme: get().theme, font: value });
  });
  /** Preview site's Apply (D-337) reaches the live site through the same path. */
  reg<{ theme: string; font: string }>("sharing.appearanceApply", ({ theme, font }) => {
    if (!isSiteAppearance({ theme, font })) throw new Error("Invalid site appearance");
    return apply({ theme, font });
  });
  reg<Record<string, never>>("sharing.appearanceRetry", () => apply({ theme: get().theme, font: get().font }));

  const str = { type: "string" as const }, bool = { type: "boolean" as const };
  const option = { type: "object" as const, properties: { id: str, label: str } };
  viewModels.register({
    id: "vm.siteAppearance",
    schema: { type: "object", properties: {
      show: bool, theme: str, font: str, busy: bool, failed: bool, problem: str, progress: bool,
      themes: { type: "array", items: option }, fonts: { type: "array", items: option },
      sampleBlocks: { type: "array", items: { type: "object", properties: {
        type: str, attrs: { type: "object", properties: { level: { type: "number" } } },
        content: { type: "array", items: { type: "object", properties: { type: str, text: str } } },
      } } },
    } },
    setters: { theme: "sharing.appearance.theme", font: "sharing.appearance.font" },
    reads: ["ui.share", "workspace"],
    select: s => {
      const a = s.ui.share.appearance ?? IDLE;
      const name = s.workspace.repo?.split("/").at(-1) ?? s.workspace.folder?.split(/[\\/]/).at(-1) ?? "";
      return {
        show: live(), theme: a.theme, font: a.font, busy: a.busy, failed: Boolean(a.problem), problem: a.problem,
        progress: s.ui.share.progress?.op === "look",
        themes: SITE_THEMES.map(id => ({ id, label: catalog.format(`sharing.theme.${id}`) })),
        fonts: SITE_FONTS.map(id => ({ id, label: catalog.format(`sharing.font.${id}`) })),
        sampleBlocks: [
          { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: name }] },
          { type: "paragraph", attrs: { level: 0 }, content: [{ type: "text", text: catalog.format("site.appearance.sample") }] },
        ],
      };
    },
  });
  return { appearance: () => ({ theme: get().theme, font: get().font }), live };
}
