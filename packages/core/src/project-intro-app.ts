import type { App } from "./app.ts";
import type { AppStateFile } from "./bridge.ts";
import type { MessageCatalog } from "./messages.ts";

export function registerProjectIntro(ctx: {
  store: App["store"]; commands: App["commands"]; viewModels: App["viewModels"]; catalog: MessageCatalog;
  appState: () => AppStateFile; persistAppState: (patch: Partial<AppStateFile>) => Promise<void>;
}) {
  const state = { notice: false, open: false, error: "" };
  const changed = () => ctx.store.update(s => ({...s}));
  ctx.commands.register({
    id: "projects.learn", title: "migrate.learn", group: "app",
    run: () => { state.open = true; changed(); },
  });
  ctx.commands.register({
    id: "projects.introClose", title: "migrate.gotIt",
    run: () => { state.open = false; changed(); },
  });
  ctx.commands.register({
    id: "projects.dismissIntro", title: "migrate.dismiss",
    run: async () => {
      try {
        await ctx.persistAppState({ projectIntroSeen: true });
        state.notice = false; state.open = false;
      } catch { state.error = ctx.catalog.format("project.intro.saveFailed"); }
      changed();
    },
  });
  ctx.viewModels.register({
    id: "vm.projectIntro", reads: "*",
    schema: {type: "object", properties: {notice: {type: "boolean"}, open: {type: "boolean"}, error: {type: "string"}}},
    select: () => state,
  });
  let shown = false;
  return {
    ready() {
      if (shown) return;
      shown = true;
      state.notice = ctx.appState().firstRun === "done" && !ctx.appState().projectIntroSeen;
      changed();
    },
  };
}
