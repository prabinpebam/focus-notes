/**
 * The Actions catalogue (D-361, ACT-01): the only actions the Actions dialog lists. A command that
 * isn't here still runs from its key, menu, dialog, agent or deep link; it's just never listed.
 * Each entry passes the framework's seven tests (Actions framework → What qualifies an action):
 * something a person sets out to do, it starts from the dialog, it has one anchor, its label is its
 * own, a check proves its outcome, it works where it's listed, and it's reachable elsewhere too.
 */

/** What an action acts on (D-363). Groups in the dialog follow this order. */
export type Anchor = "selection" | "note" | "project" | "app";
export const ANCHORS: readonly Anchor[] = ["selection", "note", "project", "app"];

/** What running it changes, which decides its confirmation and its way back (Actions framework → Effects). */
export type Effect = "navigate" | "toggle" | "flow" | "edit" | "files" | "visibility" | "outbound" | "destructive";
/** Where words or files go when it runs, if anywhere (Actions framework → Privacy). */
export type Leaves = "none" | "github" | "ai" | "system" | "browser";

/** What was true when Actions opened (ACT-05): every action is listed and run against this. */
export interface ActionScope {
  /** A non-empty text selection in the open note. */
  selection: boolean;
  /** A note is open and ready. */
  note: boolean;
  /** The open note can be changed. */
  writable: boolean;
  /** The open note's visibility, in a project with both roots. */
  visibility?: "public" | "private" | "shared";
  /** A project's window with a folder of notes (desktop). */
  project: boolean;
  /** A standalone file's window. */
  standalone: boolean;
  /** Signed in to GitHub. */
  signedIn: boolean;
  /** The project is linked to GitHub. */
  linked: boolean;
  /** The open note's path, to notice it changed before an action runs. */
  path?: string;
}

/** A command to run, with fixed arguments; `path` is replaced by the open note's path. */
export type Step = readonly [command: string, args?: Record<string, unknown>];

export interface CatalogEntry {
  /** Stable, never reused (Actions framework → Versioning). */
  id: string;
  /** What it runs, in order. The first step's command gives the shortcut, state and availability. */
  steps: readonly Step[];
  /** Message key of its label; `${label}.outcome` says what happens, `${label}.keywords` adds search words. */
  label: string;
  anchor: Anchor;
  effect: Effect;
  leaves: Leaves;
  /** Hidden unless this holds (Q3, Q6). The anchor's own presence is checked as well. */
  when?: (s: ActionScope) => boolean;
  /** Blocked while this returns a reason (a message key); the fix is listed right after it (ACT-08). */
  blockedBy?: (s: ActionScope) => string | undefined;
  /** The action that removes the block. */
  fix?: string;
  /** Found by typing and in `>`, but not in the empty field's short list. */
  quiet?: true;
  /** Its pointer paths elsewhere (Q7, ACT-16). */
  alsoIn: readonly string[];
  /** The check that runs it from Actions and asserts what the person sees (Q5, ACT-02). */
  proof: string;
}

const inProject = (s: ActionScope) => s.project;
const writable = (s: ActionScope) => s.writable;

const PROOF = "packages/core/test/actions-proof.test.ts";
const proof = (title: string) => `${PROOF}: ${title}`;

/** The starter set (Actions → The starter set): its Ready rows, in each group's display order. */
export const CATALOG: readonly CatalogEntry[] = [
  // ---- This selection ----
  { id: "format.bold", steps: [["format.bold"]], label: "actions.format.bold", anchor: "selection", effect: "edit", leaves: "none", when: writable, alsoIn: ["formatting toolbar"], proof: proof("format.bold") },
  { id: "format.italic", steps: [["format.italic"]], label: "actions.format.italic", anchor: "selection", effect: "edit", leaves: "none", when: writable, alsoIn: ["formatting toolbar"], proof: proof("format.italic") },
  { id: "format.strike", steps: [["format.strike"]], label: "actions.format.strike", anchor: "selection", effect: "edit", leaves: "none", when: writable, alsoIn: ["formatting toolbar"], proof: proof("format.strike") },
  { id: "format.code", steps: [["format.code"]], label: "actions.format.code", anchor: "selection", effect: "edit", leaves: "none", when: writable, alsoIn: ["formatting toolbar"], proof: proof("format.code") },
  { id: "link.edit", steps: [["link.edit"]], label: "actions.link.edit", anchor: "selection", effect: "edit", leaves: "none", when: writable, alsoIn: ["formatting toolbar"], proof: proof("link.edit") },
  { id: "rewrite.open", steps: [["rewrite.open"]], label: "actions.rewrite.open", anchor: "selection", effect: "outbound", leaves: "ai", when: writable, fix: "ai.connect", alsoIn: ["text menu", "Edit menu"], proof: proof("rewrite.open") },

  // ---- This note ----
  { id: "note.share", steps: [["note.share"]], label: "actions.note.share", anchor: "note", effect: "outbound", leaves: "github", when: inProject, alsoIn: ["toolbar", "File menu"], proof: proof("note.share") },
  {
    id: "note.publish", steps: [["note.publish"]], label: "actions.note.publish", anchor: "note", effect: "outbound", leaves: "github", when: inProject,
    blockedBy: (s) => (s.visibility === "private" ? "actions.reason.makePublicFirst" : undefined), fix: "note.makePublic",
    alsoIn: ["toolbar", "File menu"], proof: proof("note.publish"),
  },
  {
    id: "note.makePublic", steps: [["files.reveal", { path: "path" }], ["files.makePublic"]], label: "actions.note.makePublic", anchor: "note", effect: "visibility", leaves: "none",
    when: (s) => inProject(s) && s.writable && s.visibility === "private", quiet: true, alsoIn: ["Files menu", "File menu"], proof: proof("note.makePublic"),
  },
  { id: "note.rename", steps: [["files.reveal", { path: "path" }], ["files.rename"]], label: "actions.note.rename", anchor: "note", effect: "files", leaves: "none", when: (s) => inProject(s) && s.writable, alsoIn: ["Files menu"], proof: proof("note.rename") },
  { id: "note.move", steps: [["files.reveal", { path: "path" }], ["files.moveTo"]], label: "actions.note.move", anchor: "note", effect: "files", leaves: "none", when: (s) => inProject(s) && s.writable, alsoIn: ["Files menu"], proof: proof("note.move") },
  { id: "note.duplicate", steps: [["files.reveal", { path: "path" }], ["files.duplicate"]], label: "actions.note.duplicate", anchor: "note", effect: "files", leaves: "none", when: (s) => inProject(s) && s.writable, alsoIn: ["Files menu"], proof: proof("note.duplicate") },
  { id: "note.reveal", steps: [["files.reveal", { path: "path" }]], label: "actions.note.reveal", anchor: "note", effect: "navigate", leaves: "none", when: inProject, alsoIn: ["Files"], proof: proof("note.reveal") },
  { id: "note.copyPublicLink", steps: [["note.copyPublicLink"]], label: "actions.note.copyPublicLink", anchor: "note", effect: "navigate", leaves: "none", when: (s) => inProject(s) && s.visibility === "public", alsoIn: ["⋯ menu", "File menu"], proof: proof("note.copyPublicLink") },
  { id: "note.revealLocal", steps: [["note.revealLocal"]], label: "actions.note.revealLocal", anchor: "note", effect: "navigate", leaves: "system", alsoIn: ["Files menu"], proof: proof("note.revealLocal") },
  { id: "history.open", steps: [["history.open"]], label: "actions.history.open", anchor: "note", effect: "navigate", leaves: "none", when: inProject, alsoIn: ["⋯ menu"], proof: proof("history.open") },
  { id: "outline.show", steps: [["outline.show"]], label: "actions.outline.show", anchor: "note", effect: "navigate", leaves: "none", alsoIn: ["contents rail"], proof: proof("outline.show") },
  { id: "note.print", steps: [["note.print"]], label: "actions.note.print", anchor: "note", effect: "flow", leaves: "system", alsoIn: ["File menu"], proof: proof("note.print") },
  { id: "note.delete", steps: [["files.reveal", { path: "path" }], ["files.delete"]], label: "actions.note.delete", anchor: "note", effect: "destructive", leaves: "none", when: (s) => inProject(s) && s.writable, alsoIn: ["Files menu"], proof: proof("note.delete") },

  // ---- This project ----
  { id: "project.settings", steps: [["project.settings"]], label: "actions.project.settings", anchor: "project", effect: "navigate", leaves: "none", alsoIn: ["project pill", "Settings"], proof: proof("project.settings") },
  { id: "note.new", steps: [["note.new"]], label: "actions.note.new", anchor: "project", effect: "files", leaves: "none", alsoIn: ["toolbar", "File menu"], proof: proof("note.new") },
  { id: "note.newIn", steps: [["note.newIn"]], label: "actions.note.newIn", anchor: "project", effect: "flow", leaves: "none", alsoIn: ["File menu", "Files menu"], proof: proof("note.newIn") },
  { id: "files.newFolder", steps: [["files.newFolder"]], label: "actions.files.newFolder", anchor: "project", effect: "flow", leaves: "none", alsoIn: ["Files menu"], proof: proof("files.newFolder") },
  { id: "files.open", steps: [["files.open"]], label: "actions.files.open", anchor: "project", effect: "navigate", leaves: "none", alsoIn: ["toolbar"], proof: proof("files.open") },
  { id: "find.allNotes", steps: [["find.allNotes"]], label: "actions.find.allNotes", anchor: "project", effect: "navigate", leaves: "none", alsoIn: ["Edit menu"], proof: proof("find.allNotes") },
  { id: "files.import", steps: [["files.import"]], label: "actions.files.import", anchor: "project", effect: "flow", leaves: "none", alsoIn: ["File menu"], proof: proof("files.import") },

  // ---- App ----
  { id: "account.signIn", steps: [["account.signIn"]], label: "actions.account.signIn", anchor: "app", effect: "flow", leaves: "github", when: (s) => !s.signedIn, alsoIn: ["Settings → Account"], proof: proof("account.signIn") },
  { id: "account.signOut", steps: [["account.signOut"]], label: "actions.account.signOut", anchor: "app", effect: "flow", leaves: "none", when: (s) => s.signedIn, alsoIn: ["Settings → Account"], proof: proof("account.signOut") },
  { id: "ai.connect", steps: [["ai.openSettings"], ["ai.add"]], label: "actions.ai.connect", anchor: "app", effect: "flow", leaves: "none", alsoIn: ["Settings → AI"], proof: proof("ai.connect") },
  { id: "shortcuts.open", steps: [["shortcuts.open"]], label: "actions.shortcuts.open", anchor: "app", effect: "navigate", leaves: "none", alsoIn: ["⋯ menu", "Help menu"], proof: proof("shortcuts.open") },
  { id: "toolbar.customize", steps: [["toolbar.customize"]], label: "actions.toolbar.customize", anchor: "app", effect: "flow", leaves: "none", alsoIn: ["⋯ menu"], proof: proof("toolbar.customize") },
  { id: "theme.manager.open", steps: [["theme.manager.open"]], label: "actions.theme.manager.open", anchor: "app", effect: "flow", leaves: "none", alsoIn: ["⋯ menu", "Settings → Appearance"], proof: proof("theme.manager.open") },
  { id: "appearance.light", steps: [["appearance.light"]], label: "actions.appearance.light", anchor: "app", effect: "toggle", leaves: "none", alsoIn: ["Settings → Appearance"], proof: proof("appearance.light") },
  { id: "appearance.dark", steps: [["appearance.dark"]], label: "actions.appearance.dark", anchor: "app", effect: "toggle", leaves: "none", alsoIn: ["Settings → Appearance"], proof: proof("appearance.dark") },
  { id: "appearance.system", steps: [["appearance.system"]], label: "actions.appearance.system", anchor: "app", effect: "toggle", leaves: "none", alsoIn: ["Settings → Appearance"], proof: proof("appearance.system") },
  { id: "focus.toggle", steps: [["focus.toggle"]], label: "actions.focus.toggle", anchor: "app", effect: "toggle", leaves: "none", alsoIn: ["toolbar"], proof: proof("focus.toggle") },
  { id: "settings.open", steps: [["settings.open"]], label: "actions.settings.open", anchor: "app", effect: "navigate", leaves: "none", alsoIn: ["⋯ menu"], proof: proof("settings.open") },
  { id: "projects.open", steps: [["projects.open"]], label: "actions.projects.open", anchor: "app", effect: "flow", leaves: "none", alsoIn: ["File menu"], proof: proof("projects.open") },
  { id: "workspace.openFromGitHub", steps: [["workspace.openFromGitHub"]], label: "actions.workspace.openFromGitHub", anchor: "app", effect: "flow", leaves: "github", alsoIn: ["Open → Open from GitHub…"], proof: proof("workspace.openFromGitHub") },
  { id: "projects.new", steps: [["projects.new"]], label: "actions.projects.new", anchor: "app", effect: "flow", leaves: "none", alsoIn: ["Open"], proof: proof("projects.new") },
  { id: "projects.openFile", steps: [["projects.openFile"]], label: "actions.projects.openFile", anchor: "app", effect: "flow", leaves: "none", alsoIn: ["Open"], proof: proof("projects.openFile") },
  { id: "help.open", steps: [["help.open"]], label: "actions.help.open", anchor: "app", effect: "navigate", leaves: "browser", alsoIn: ["Help menu"], proof: proof("help.open") },
  { id: "feedback.open", steps: [["feedback.open"]], label: "actions.feedback.open", anchor: "app", effect: "flow", leaves: "github", alsoIn: ["Help menu"], proof: proof("feedback.open") },
  { id: "diagnostics.reportProblem", steps: [["diagnostics.reportProblem"]], label: "actions.diagnostics.reportProblem", anchor: "app", effect: "flow", leaves: "none", alsoIn: ["Help menu"], proof: proof("diagnostics.reportProblem") },
  { id: "diagnostics.save", steps: [["diagnostics.save"]], label: "actions.diagnostics.save", anchor: "app", effect: "flow", leaves: "none", alsoIn: ["Help menu", "Settings → About"], proof: proof("diagnostics.save") },
  { id: "window.fullScreen", steps: [["window.fullScreen"]], label: "actions.window.fullScreen", anchor: "app", effect: "toggle", leaves: "none", alsoIn: ["View menu"], proof: proof("window.fullScreen") },
];

const BY_ID = new Map(CATALOG.map((e) => [e.id, e]));
export const catalogEntry = (id: string): CatalogEntry | undefined => BY_ID.get(id);

/** Whether an action's anchor is there at all (Q3). */
export function anchorPresent(anchor: Anchor, s: ActionScope): boolean {
  switch (anchor) {
    case "selection": return s.selection && s.note;
    case "note": return s.note;
    case "project": return s.project;
    case "app": return true;
  }
}
/** What `>` says an action needs when its anchor isn't there. */
export const NEEDS: Record<Anchor, string> = {
  selection: "actions.needs.selection", note: "actions.needs.note", project: "actions.needs.project", app: "actions.needs.app",
};

/** Listed now (ACT-08): its anchor is present and nothing hides it. */
export const listable = (e: CatalogEntry, s: ActionScope): boolean => anchorPresent(e.anchor, s) && (e.when?.(s) ?? true);

/** The steps with the open note's path put in. */
export function stepsFor(e: CatalogEntry, s: Pick<ActionScope, "path">): Step[] {
  return e.steps.map(([id, args]) => [id, args && args.path === "path" ? { ...args, path: s.path ?? "" } : args] as const);
}

/**
 * What's wrong with the catalogue (ACT-02, ACT-07, ACT-16): every step's command exists, every entry
 * has a proof and a pointer path, labels are unique and say their object when a verb repeats, and
 * no search word is another action's label. `label` turns a message key into its words.
 */
export function catalogProblems(entries: readonly CatalogEntry[], has: (command: string) => boolean, label: (key: string) => string, keywords: (key: string) => string[] = () => []): string[] {
  const out: string[] = [];
  const ids = new Set<string>();
  const labels = new Map<string, string>();
  for (const e of entries) {
    if (ids.has(e.id)) out.push(`${e.id}: id used twice`);
    ids.add(e.id);
    for (const [c] of e.steps) if (!has(c)) out.push(`${e.id}: no command ${c}`);
    if (!e.proof.trim()) out.push(`${e.id}: no proof`);
    if (!e.alsoIn.length) out.push(`${e.id}: no pointer path`);
    if (e.fix && !entries.some((x) => x.id === e.fix)) out.push(`${e.id}: its fix ${e.fix} isn't catalogued`);
    const words = label(e.label).trim();
    if (!words || words === e.label) out.push(`${e.id}: no words for ${e.label}`);
    const key = words.toLowerCase();
    if (labels.has(key)) out.push(`${e.id}: label "${words}" is also ${labels.get(key)}'s`);
    labels.set(key, e.id);
  }
  // D2: a verb shared by several actions needs its object in each label.
  const byVerb = new Map<string, string[]>();
  for (const e of entries) {
    const verb = label(e.label).trim().split(/\s+/)[0]!.toLowerCase();
    byVerb.set(verb, [...(byVerb.get(verb) ?? []), e.id]);
  }
  for (const [, list] of byVerb) if (list.length > 1) for (const id of list) {
    const e = entries.find((x) => x.id === id)!;
    if (label(e.label).trim().split(/\s+/).length === 1) out.push(`${id}: its verb is shared; say what it acts on`);
  }
  // D7: a search word that is another action's whole label.
  for (const e of entries) for (const k of keywords(`${e.label}.keywords`)) {
    const other = labels.get(k.toLowerCase());
    if (other && other !== e.id) out.push(`${e.id}: search word "${k}" is ${other}'s label`);
  }
  return [...new Set(out)];
}

/** D8: pairs worth a look whenever the catalogue changes: the same verb, side by side with their outcomes. */
export function lookAlikes(entries: readonly CatalogEntry[], label: (key: string) => string): [string, string][] {
  const out: [string, string][] = [];
  for (let i = 0; i < entries.length; i++) for (let j = i + 1; j < entries.length; j++) {
    const a = label(entries[i]!.label).split(/\s+/)[0]!.toLowerCase();
    const b = label(entries[j]!.label).split(/\s+/)[0]!.toLowerCase();
    if (a === b) out.push([entries[i]!.id, entries[j]!.id]);
  }
  return out;
}
