/**
 * One concept, Project (owner, 5 November; strict design, not wired): Settings with no Workspace tab.
 * The Project tab reuses the app's own Project panel unchanged (name, colour, logo, watermark, font,
 * theme, people) over fake data, and adds where the project is kept: offline or linked to GitHub.
 * A standalone file's window gets a This file tab instead. Spec: documentations/experience/project-model.md.
 */
import settings from "../../views/settings.view.json" with { type: "json" };
import data from "./data.json" with { type: "json" };
import home from "./home.json" with { type: "json" };
import del from "./delete.json" with { type: "json" };
import projects from "../../views/projects.view.json" with { type: "json" };
import openData from "../open/data.json" with { type: "json" };
import { compose } from "../../src/compose.ts";

type Entry = { id: string; label: string; view: string; local?: Record<string, string | number | boolean> };
type Node = Record<string, unknown>;

const findCase = (node: unknown, name: string): unknown => {
  if (Array.isArray(node)) { for (const n of node) { const hit = findCase(n, name); if (hit) return hit; } return undefined; }
  if (!node || typeof node !== "object") return undefined;
  const n = node as Node;
  if (n.switch && n.cases && (n.cases as Node)[name]) return (n.cases as Node)[name];
  for (const v of Object.values(n)) { const hit = findCase(v, name); if (hit) return hit; }
  return undefined;
};

/** The real panel's reads point at fake models; actions are left out, as in the Open mock. */
const mockOf = (node: unknown, people: string): unknown => {
  if (Array.isArray(node)) return node.map((n) => mockOf(n, people));
  if (!node || typeof node !== "object") return typeof node === "string" ? node.replace(/^vm\.project\b/, "vm.pnwProject").replace(/^vm\.sharingPeople\b/, `vm.${people}`) : node;
  return Object.fromEntries(Object.entries(node).filter(([k]) => k !== "on").map(([k, v]) => [k === "bind" ? "get" : k, mockOf(v, people)]));
};

const identity = findCase(compose(settings).root, "project");
const unchanged = { type: "Text", props: { value: { t: "project.mock.pnw.unchanged" }, tone: "muted" } };

const dialog = (sections: string, panels: Record<string, unknown>) => ({
  type: "Dialog",
  id: "settings",
  props: { title: { t: "settings.title" }, closeLabel: { t: "dialog.close" }, open: true, size: "l", height: "navigation" },
  children: [{
    type: "Tabs",
    id: "settingsCategories",
    props: { label: { t: "settings.categories" }, items: { get: sections }, value: { bind: "local.section" }, orientation: "vertical", scrollPanel: true },
    slots: { footer: [{ type: "Button", id: "settingsFeedback", props: { label: { t: "feedback.settingsButton" }, variant: "subtle", icon: "feedback" } }] },
    children: [{ switch: { get: "local.section" }, cases: panels }],
  }],
});

/** Delete (owner, 5 November; strict design): the Open view after a project is deleted, with one notification pill. */
const openOf = (node: unknown): unknown => {
  if (Array.isArray(node)) return node.map(openOf);
  if (!node || typeof node !== "object") return typeof node === "string" ? node.replace(/^vm\.projects\b/, "vm.pnwOpen") : node;
  return Object.fromEntries(Object.entries(node).filter(([k]) => k !== "on").map(([k, v]) => [k === "bind" ? "get" : k, openOf(v)]));
};
const openView = openOf(compose(projects)) as { root: unknown; local?: Record<string, unknown> };
const pill = (message: string, tone: string, action?: string) => ({
  type: "Toast",
  props: { message: { get: `vm.pnwDel.${message}` }, tone, dismissLabel: { t: "toast.dismiss" }, ...(action ? { actionLabel: { get: `vm.pnwDel.${action}` }, sticky: true } : {}) },
});
const withPill = (root: unknown, layer: unknown): unknown => {
  const r = root as { children: { type: string; children: unknown[] }[] };
  const first = r.children.findIndex((c) => c.type === "Dialog");
  return { ...r, children: r.children.map((c, i) => (i === first ? { ...c, children: [...c.children, layer] } : c)) };
};
const gone = new Set(["p2", "r3"]);
const afterDelete = { ...openData, entries: openData.entries.filter((e) => !gone.has(e.id)), recent: openData.recent.filter((e) => !gone.has(e.id)) };

const others = Object.fromEntries(["account", "sharing", "agents", "ai", "appearance", "keyboard", "about"].map((id) => [id, unchanged]));
const projectView = (variant: "linked" | "offline") => ({
  id: `gallery.mock.pnw.${variant}`,
  focus: "settingsCategories",
  local: { section: "project" },
  root: dialog("vm.pnw.sections", {
    ...others,
    project: { type: "Stack", props: { gap: "stackSection" }, children: [mockOf(identity, variant === "linked" ? "pnwPeople" : "pnwPeopleOff"), home[variant]] },
  }),
});

export const projectMocks = {
  id: "pnw",
  label: "Mocks: One concept, Project (5 November)",
  models: {
    pnw: { sections: data.sections, fileSections: data.fileSections, folder: data.folder, repo: data.repo, file: data.file },
    pnwProject: data.project,
    pnwPeople: { ...data.people, available: true },
    pnwPeopleOff: data.people,
    pnwDel: data.del,
    pnwOpen: afterDelete,
  },
  views: {
    linked: projectView("linked"),
    offline: projectView("offline"),
    file: {
      id: "gallery.mock.pnw.file",
      focus: "settingsCategories",
      local: { section: "file", kind: "md" },
      root: dialog("vm.pnw.fileSections", { ...others, file: home.file }),
    },
    delete: { id: "gallery.mock.pnw.delete", focus: "projectDelete", local: { step: "consequences", kind: "linked", problem: "", typed: "", private: true, exported: false }, root: del },
    deleted: {
      ...openView,
      id: "gallery.mock.pnw.deleted",
      local: { ...(openView.local ?? {}), toast: "done" },
      // The design system drops a toast under an open dialog, so the pill rides in the Open dialog it belongs to.
      root: withPill(openView.root, {
        type: "Layer",
        id: "toasts",
        props: { layer: "toast", position: "bottomCenter" },
        children: [{ switch: { get: "local.toast" }, cases: { done: pill("toastDone", "success"), offline: pill("toastOffline", "success"), kept: pill("toastKept", "warning", "toastKeptAction") } }],
      }),
    },
  },
  entries: [
    { id: "pnw.linked", label: "1. Settings → Project, linked to GitHub (no Workspace tab)", view: "linked" },
    { id: "pnw.offline", label: "2. Settings → Project, offline (Git on this computer only)", view: "offline" },
    { id: "pnw.fileMd", label: "3. Standalone .md file: Settings → This file, images go beside it", view: "file" },
    { id: "pnw.fileTxt", label: "4. Standalone .txt file: Insert image… unavailable, with the reason", view: "file", local: { kind: "txt" } },
    { id: "pnw.deleteEntry", label: "5. Delete: Settings → Project → Delete project…", view: "linked" },
    { id: "pnw.deleteConsequences", label: "6. Delete: what's deleted (site, share links, people, private notes, this computer)", view: "delete" },
    { id: "pnw.deleteUnsynced", label: "7. Delete: notes not on GitHub yet, save a copy first", view: "delete", local: { step: "unsynced" } },
    { id: "pnw.deleteUnsyncedSaved", label: "8. Delete: copy saved, continue", view: "delete", local: { step: "unsynced", exported: true } },
    { id: "pnw.deleteConfirm", label: "9. Delete: type the project's name", view: "delete", local: { step: "confirm" } },
    { id: "pnw.deleteGithub", label: "10. Delete: delete it on GitHub (hand-off), the app notices", view: "delete", local: { step: "github" } },
    { id: "pnw.deleteProgress", label: "11. Delete: progress with named steps", view: "delete", local: { step: "progress" } },
    { id: "pnw.deleteDone", label: "12. Delete: done, Open with one notification pill", view: "deleted" },
    { id: "pnw.deleteOffline", label: "13. Delete an offline project: Recycle Bin only, type the name", view: "delete", local: { kind: "offline" } },
    { id: "pnw.deleteOfflineDone", label: "14. Delete an offline project: done", view: "deleted", local: { toast: "offline" } },
    { id: "pnw.deleteErrOffline", label: "15. Delete fails: offline", view: "delete", local: { problem: "offline" } },
    { id: "pnw.deleteErrSignin", label: "16. Delete fails: sign in again", view: "delete", local: { problem: "signin" } },
    { id: "pnw.deleteErrNotAdmin", label: "17. Delete fails: not an owner of the repository", view: "delete", local: { problem: "notAdmin" } },
    { id: "pnw.deleteErrWindow", label: "18. Delete fails: open in another window", view: "delete", local: { problem: "window" } },
    { id: "pnw.deleteErrGone", label: "19. Delete: already gone from GitHub", view: "delete", local: { problem: "gone" } },
    { id: "pnw.deleteErrPolicy", label: "20. Delete fails: the organization blocks deleting", view: "delete", local: { step: "github", problem: "policy" } },
    { id: "pnw.deleteErrRateLimit", label: "21. Delete waits: GitHub rate limit", view: "delete", local: { step: "github", problem: "rateLimit" } },
    { id: "pnw.deleteErrExpired", label: "22. Delete fails: sign-in expired while waiting", view: "delete", local: { step: "github", problem: "signin" } },
    { id: "pnw.deleteErrPartialLocal", label: "23. Partial: deleted on GitHub, folder still here", view: "delete", local: { step: "progress", problem: "partialLocal" } },
    { id: "pnw.deleteErrPartialGithub", label: "24. Partial: removed here, still on GitHub", view: "deleted", local: { toast: "kept" } },
    { id: "pnw.deleteCancelled", label: "25. Delete stopped midway", view: "delete", local: { step: "stopped" } },
  ] as Entry[],
};
