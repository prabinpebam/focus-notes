/**
 * One concept, Project (owner, 5 November; strict design, not wired): Settings with no Workspace tab.
 * The Project tab reuses the app's own Project panel unchanged (name, colour, logo, watermark, font,
 * theme, people) over fake data, and adds where the project is kept: offline or linked to GitHub.
 * A standalone file's window gets a This file tab instead. Spec: documentations/experience/project-model.md.
 */
import settings from "../../views/settings.view.json" with { type: "json" };
import data from "./data.json" with { type: "json" };
import home from "./home.json" with { type: "json" };
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
    children: [{ switch: { get: "local.section" }, cases: panels }],
  }],
});

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
  },
  entries: [
    { id: "pnw.linked", label: "1. Settings → Project, linked to GitHub (no Workspace tab)", view: "linked" },
    { id: "pnw.offline", label: "2. Settings → Project, offline (Git on this computer only)", view: "offline" },
    { id: "pnw.fileMd", label: "3. Standalone .md file: Settings → This file, images go beside it", view: "file" },
    { id: "pnw.fileTxt", label: "4. Standalone .txt file: Insert image… unavailable, with the reason", view: "file", local: { kind: "txt" } },
  ] as Entry[],
};
