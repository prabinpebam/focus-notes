import type { App } from "./app.ts";
import type { MessageCatalog } from "./messages.ts";

export function registerProjectIntro(ctx: {
  store: App["store"]; commands: App["commands"]; viewModels: App["viewModels"]; catalog: MessageCatalog;
}) {
  const state = { open: false };
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
    id: "projects.dismissIntro", title: "migrate.gotIt",
    run: () => { state.open = false; changed(); },
  });
  ctx.viewModels.register({
    id: "vm.projectIntro", reads: "*",
    schema: {type: "object", properties: {open: {type: "boolean"}}},
    select: () => ({ ...state }),
  });
}
