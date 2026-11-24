/**
 * Recovery alert wiring in the app (FRE-13, G5.4, D-213, D-408).
 * Subscribes to `bridge.syncAlert`, exposes `vm.recoveryAlert` for both the corner SaveState popover
 * and the Files header alert popover, registers its actions, and shows one toast per session when
 * GitHub sign-in stops working.
 */
import type { PlatformBridge } from "./bridge.ts";
import type { CommandRegistry } from "./commands.ts";
import type { MessageCatalog } from "./messages.ts";
import type { NotificationOptions } from "./notifications.ts";
import type { Store } from "./store.ts";
import type { SyncState } from "./sync-app.ts";
import type { TaskTracker } from "./tasks.ts";
import type { ViewModelRegistry } from "./view-models.ts";
import { NO_SYNC_ALERT, recoveryAlertView, type SyncAlertReport } from "./recovery-alert.ts";

export interface RecoveryAlertAppState {
  report: SyncAlertReport;
  cornerOpen: boolean;
  headerOpen: boolean;
}

export const RECOVERY_ALERT_INITIAL: RecoveryAlertAppState = {
  report: NO_SYNC_ALERT,
  cornerOpen: false,
  headerOpen: false,
};

interface State {
  sync: SyncState;
  recoveryAlert: RecoveryAlertAppState;
  workspace: { folder?: string; repo?: string };
}

interface Ctx<S extends State> {
  store: Store<S>;
  bridge: PlatformBridge;
  catalog: MessageCatalog;
  commands: CommandRegistry<S>;
  viewModels: ViewModelRegistry<S>;
  tracker?: TaskTracker;
  toast: (message: string, opts?: NotificationOptions) => unknown;
  again: (scope: "account" | "workspace") => Promise<boolean>;
  now?: () => number;
}

export function registerRecoveryAlert<S extends State>({ store, bridge, catalog, commands, viewModels, tracker, toast, again, now = Date.now }: Ctx<S>) {
  let signInToastShown = false;

  const setState = (patch: Partial<RecoveryAlertAppState>) =>
    store.update((s) => ({ ...s, recoveryAlert: { ...s.recoveryAlert, ...patch } }));

  const apply = (report: SyncAlertReport) => {
    const next = report ?? NO_SYNC_ALERT;
    setState({
      report: next,
      ...(!next.cause ? { cornerOpen: false, headerOpen: false } : {}),
    });
    if (next.cause === "signIn" && !signInToastShown && catalog.has("recoveryAlert.toast.signIn")) {
      signInToastShown = true;
      toast(catalog.format("recoveryAlert.toast.signIn"), {
        tone: "warning",
        action: { command: "recoveryAlert.primary", label: catalog.format("recoveryAlert.action.signInAgain") },
      });
    }
  };

  const currentCause = () => store.state.recoveryAlert.report.cause ?? (store.state.sync.problem === "auth" ? "signIn" : undefined);

  commands.register({
    id: "recoveryAlert.notNow",
    title: "command.recoveryAlert.notNow",
    run: () => { setState({ cornerOpen: false, headerOpen: false }); },
  });

  commands.register<{ open?: boolean }>({
    id: "recoveryAlert.setCornerOpen",
    title: "command.recoveryAlert.setCornerOpen",
    run: ({ open }) => { setState({ cornerOpen: Boolean(open) }); },
  });

  commands.register<{ open?: boolean }>({
    id: "recoveryAlert.setHeaderOpen",
    title: "command.recoveryAlert.setHeaderOpen",
    run: ({ open }) => { setState({ headerOpen: Boolean(open) }); },
  });

  commands.register({
    id: "recoveryAlert.primary",
    title: "command.recoveryAlert.primary",
    run: async () => {
      const cause = currentCause();
      if (!cause) return;
      setState({ cornerOpen: false, headerOpen: false });
      if (cause === "signIn" || cause === "otherAccount") {
        await again("account");
        if (bridge.syncAlert) apply(await bridge.syncAlert.status().catch(() => store.state.recoveryAlert.report));
        return;
      }
      if (cause === "remoteGone") {
        await again("workspace");
        if (bridge.syncAlert) apply(await bridge.syncAlert.status().catch(() => store.state.recoveryAlert.report));
        return;
      }
      if (cause === "massDelete" && bridge.syncAlert) {
        const res = await (tracker ? tracker.run("recoveryAlert.restore", "recoveryAlert.action.restore", () => bridge.syncAlert!.act("restore")) : bridge.syncAlert.act("restore"));
        apply(res);
        return;
      }
      if (cause === "failed" && bridge.syncAlert) {
        const res = await (tracker ? tracker.run("recoveryAlert.retry", "recoveryAlert.action.tryAgain", () => bridge.syncAlert!.act("retry")) : bridge.syncAlert.act("retry"));
        apply(res);
        return;
      }
      if ((cause === "unlinked" || cause === "inbound") && bridge.syncAlert) {
        const res = await (tracker ? tracker.run("recoveryAlert.sync", "recoveryAlert.action.syncNow", () => bridge.syncAlert!.act("sync")) : bridge.syncAlert.act("sync"));
        apply(res);
        return;
      }
      if (cause === "inbound") {
        await commands.run("note.save");
      }
    },
  });

  commands.register({
    id: "recoveryAlert.secondary",
    title: "command.recoveryAlert.secondary",
    run: async () => {
      const cause = currentCause();
      if (cause !== "massDelete" || !bridge.syncAlert) return;
      setState({ cornerOpen: false, headerOpen: false });
      const res = await (tracker ? tracker.run("recoveryAlert.removeRemote", "recoveryAlert.action.removeRemote", () => bridge.syncAlert!.act("removeRemote")) : bridge.syncAlert.act("removeRemote"));
      apply(res);
    },
  });

  viewModels.register({
    id: "vm.syncAlert",
    schema: {
      type: "object",
      properties: {
        active: { type: "boolean" },
        headerAlert: { type: "boolean" },
        cause: { type: "string" },
        icon: { type: "string", enum: ["warning", "cloudUp"] },
        tone: { type: "string", enum: ["warning", "accent", "danger"] },
        busy: { type: "boolean" },
        title: { type: "string" },
        line: { type: "string" },
        progress: { type: "number" },
        progressLabel: { type: "string" },
        hasProgress: { type: "boolean" },
        facts: { type: "array", items: { type: "object", properties: { id: { type: "string" }, text: { type: "string" } } } },
        primary: { type: "string" },
        hasPrimary: { type: "boolean" },
        secondary: { type: "string" },
        hasSecondary: { type: "boolean" },
        notNow: { type: "string" },
        hasNotNow: { type: "boolean" },
        alertLabel: { type: "string" },
        cornerState: { type: "string", enum: ["error", "syncing"] },
        cornerText: { type: "string" },
        cornerOpen: { type: "boolean" },
        headerOpen: { type: "boolean" },
      },
    },
    reads: ["recoveryAlert", "sync", "workspace"],
    select: (s) => recoveryAlertView({
      report: s.recoveryAlert.report,
      sync: s.sync,
      folder: s.workspace.folder,
      repository: s.workspace.repo,
      cornerOpen: s.recoveryAlert.cornerOpen,
      headerOpen: s.recoveryAlert.headerOpen,
    }, catalog, now()),
  });

  return {
    start() {
      if (!bridge.syncAlert) return;
      bridge.syncAlert.onStatus((r) => apply(r));
      void bridge.syncAlert.status().then((r) => apply(r), () => {});
    },
  };
}
