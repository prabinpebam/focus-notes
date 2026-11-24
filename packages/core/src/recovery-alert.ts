/**
 * Account and sync recovery alert (FRE-13, G5.4, D-213, D-408, UC-SAFE-10).
 * When the notes folder is there, an account or sync problem never blocks writing: the corner's
 * save state and the Files header carry the same alert icon, and both open one IconLayout card
 * naming the cause, what differs, the facts and the action.
 */
import type { MessageCatalog } from "./messages.ts";
import type { SyncState } from "./sync-app.ts";

export type SyncAlertCause =
  | "autoSync"
  | "unlinked"
  | "signIn"
  | "otherAccount"
  | "remoteGone"
  | "inbound"
  | "massDelete"
  | "syncing"
  | "failed";

export interface SyncAlertStep {
  id: string;
  text: string;
}

export interface SyncAlertReport {
  /** Active recovery alert cause, or undefined when everything is in order. */
  cause?: SyncAlertCause;
  /** Shortened folder path (e.g. "Documents\\prabins-notes"). */
  folder?: string;
  /** Repository owner/name (e.g. "prabin-demo/prabins-notes"). */
  repository?: string;
  /** ISO 8601 timestamp of last backup, if known. */
  lastBackup?: string;
  /** Active GitHub login when signed in as another account. */
  login?: string;
  /** Local notes count (unlinked), inbound changes count (inbound), or missing notes count (massDelete). */
  count?: number;
  /** Progress percentage (0..100) for autoSync or syncing. */
  progress?: number;
  /** Current step (1-based) and total steps for syncing. */
  step?: number;
  total?: number;
  /** Step status lines for syncing. */
  steps?: SyncAlertStep[];
  /** Human-readable reason for inbound or failed. */
  reason?: string;
  /** Backup is paused (e.g. mass external deletion). */
  paused?: boolean;
}

export type SyncAlertAction = "sync" | "restore" | "removeRemote" | "retry";

export interface SyncAlertBridge {
  status(): Promise<SyncAlertReport>;
  onStatus(listener: (report: SyncAlertReport) => void): () => void;
  act(action: SyncAlertAction): Promise<SyncAlertReport>;
}

export interface RecoveryAlertFact {
  id: string;
  text: string;
}

export interface RecoveryAlertView {
  active: boolean;
  headerAlert: boolean;
  cause: string;
  icon: "warning" | "cloudUp";
  tone: "warning" | "accent" | "danger";
  busy: boolean;
  title: string;
  line: string;
  progress: number;
  progressLabel: string;
  hasProgress: boolean;
  facts: RecoveryAlertFact[];
  primary: string;
  hasPrimary: boolean;
  secondary: string;
  hasSecondary: boolean;
  notNow: string;
  hasNotNow: boolean;
  alertLabel: string;
  cornerState: "error" | "syncing";
  cornerText: string;
  cornerOpen: boolean;
  headerOpen: boolean;
}

export const NO_SYNC_ALERT: SyncAlertReport = {};

function formatRelativeBackup(iso: string | undefined, catalog: MessageCatalog, now: number): string {
  if (!iso) return "";
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return "";
  const diffMin = Math.max(0, Math.round((now - at) / 60_000));
  if (diffMin < 1) return catalog.format("recoveryAlert.when.justNow");
  if (diffMin < 60) return catalog.format("recoveryAlert.when.minutes", { count: diffMin });
  const diffHours = Math.round(diffMin / 60);
  if (diffHours < 24) return catalog.format("recoveryAlert.when.hours", { count: diffHours });
  const diffDays = Math.round(diffHours / 24);
  return catalog.format("recoveryAlert.when.days", { count: diffDays });
}

function repoName(repository: string | undefined): string {
  if (!repository) return "";
  const parts = repository.split("/");
  return parts[parts.length - 1] || repository;
}

export interface RecoveryAlertViewInput {
  report: SyncAlertReport;
  sync: SyncState;
  folder?: string;
  repository?: string;
  cornerOpen: boolean;
  headerOpen: boolean;
}

/**
 * Projects live sync-alert and sync state onto the approved two-column IconLayout card (D-408, FRE-13, G5.4).
 * When no explicit alert report is active, an auth problem from GitSync still surfaces the sign-in card.
 */
export function recoveryAlertView(input: RecoveryAlertViewInput, catalog: MessageCatalog, now = Date.now()): RecoveryAlertView {
  const { report, sync, cornerOpen, headerOpen } = input;
  const cause: SyncAlertCause | undefined = report.cause ?? (sync.problem === "auth" ? "signIn" : undefined);
  const folder = report.folder ?? input.folder ?? "";
  const repository = report.repository ?? input.repository ?? "";
  const notes = repoName(repository) || catalog.format("recoveryAlert.notesFallback");
  const when = formatRelativeBackup(report.lastBackup ?? (sync.backedUpAt !== undefined ? new Date(sync.backedUpAt).toISOString() : undefined), catalog, now);

  if (!cause) {
    return {
      active: false,
      headerAlert: false,
      cause: "",
      icon: "warning",
      tone: "warning",
      busy: false,
      title: "",
      line: "",
      progress: 0,
      progressLabel: "",
      hasProgress: false,
      facts: [],
      primary: "",
      hasPrimary: false,
      secondary: "",
      hasSecondary: false,
      notNow: "",
      hasNotNow: false,
      alertLabel: "",
      cornerState: "error",
      cornerText: "",
      cornerOpen,
      headerOpen,
    };
  }

  const busy = cause === "autoSync" || cause === "syncing";
  const icon: "warning" | "cloudUp" = busy ? "cloudUp" : "warning";
  const tone: "warning" | "accent" | "danger" = busy ? "accent" : cause === "failed" ? "danger" : "warning";
  const count = report.count ?? 0;
  const progress = busy ? Math.max(0, Math.min(100, Math.round(report.progress ?? 0))) : 0;
  const step = report.step ?? 1;
  const total = report.total ?? 5;
  const login = report.login ? (report.login.startsWith("@") ? report.login : `@${report.login}`) : "@other";

  let title = "";
  let line = "";
  let progressLabel = "";
  let primary = "";
  let secondary = "";
  let notNow = "";

  switch (cause) {
    case "autoSync":
      title = catalog.format("recoveryAlert.autoSync.title");
      line = when
        ? catalog.format("recoveryAlert.autoSync.lineWhen", { notes, when })
        : catalog.format("recoveryAlert.autoSync.line", { notes });
      progressLabel = catalog.format("recoveryAlert.autoSync.progress", { percent: progress });
      break;
    case "unlinked":
      title = catalog.format("recoveryAlert.unlinked.title");
      line = count > 0
        ? catalog.format("recoveryAlert.unlinked.lineCount", { count })
        : catalog.format("recoveryAlert.unlinked.line");
      primary = catalog.format("recoveryAlert.action.syncNow");
      notNow = catalog.format("recoveryAlert.action.notNow");
      break;
    case "signIn":
      title = catalog.format("recoveryAlert.signIn.title");
      line = catalog.format("recoveryAlert.signIn.line");
      primary = catalog.format("recoveryAlert.action.signInAgain");
      notNow = catalog.format("recoveryAlert.action.notNow");
      break;
    case "otherAccount":
      title = catalog.format("recoveryAlert.otherAccount.title", { login });
      line = catalog.format("recoveryAlert.otherAccount.line", { login, notes });
      primary = catalog.format("recoveryAlert.action.switchAccount");
      notNow = catalog.format("recoveryAlert.action.notNow");
      break;
    case "remoteGone":
      title = catalog.format("recoveryAlert.remoteGone.title");
      line = catalog.format("recoveryAlert.remoteGone.line", { notes });
      primary = catalog.format("recoveryAlert.action.chooseWhatToDo");
      notNow = catalog.format("recoveryAlert.action.notNow");
      break;
    case "inbound":
      title = catalog.format("recoveryAlert.inbound.title", { count: Math.max(1, count) });
      line = report.reason || catalog.format("recoveryAlert.inbound.line");
      primary = catalog.format("recoveryAlert.action.syncNow");
      notNow = catalog.format("recoveryAlert.action.notNow");
      break;
    case "massDelete":
      title = catalog.format("recoveryAlert.massDelete.title", { count: Math.max(1, count) });
      line = catalog.format("recoveryAlert.massDelete.line");
      primary = catalog.format("recoveryAlert.action.restore");
      secondary = catalog.format("recoveryAlert.action.removeRemote");
      break;
    case "syncing":
      title = catalog.format("recoveryAlert.syncing.title", { step, total });
      line = report.reason || catalog.format("recoveryAlert.syncing.line");
      progressLabel = title;
      break;
    case "failed":
      title = catalog.format("recoveryAlert.failed.title");
      line = report.reason || catalog.format("recoveryAlert.failed.line");
      primary = catalog.format("recoveryAlert.action.tryAgain");
      notNow = catalog.format("recoveryAlert.action.notNow");
      break;
  }

  const facts: RecoveryAlertFact[] = [];
  if (cause === "syncing" && report.steps && report.steps.length > 0) {
    for (const s of report.steps) facts.push({ id: s.id, text: s.text });
  } else {
    if (folder) facts.push({ id: "folder", text: catalog.format("recoveryAlert.fact.folder", { folder }) });
    if (repository) facts.push({ id: "repo", text: catalog.format("recoveryAlert.fact.repo", { repository }) });
    if (when && cause !== "autoSync" && cause !== "failed") {
      facts.push({ id: "backup", text: catalog.format("recoveryAlert.fact.backup", { when }) });
    }
  }

  return {
    active: true,
    headerAlert: !busy,
    cause,
    icon,
    tone,
    busy,
    title,
    line,
    progress,
    progressLabel,
    hasProgress: busy && progress > 0,
    facts,
    primary,
    hasPrimary: primary !== "",
    secondary,
    hasSecondary: secondary !== "",
    notNow,
    hasNotNow: notNow !== "",
    alertLabel: title,
    cornerState: busy ? "syncing" : "error",
    cornerText: busy ? progressLabel : "",
    cornerOpen,
    headerOpen,
  };
}
