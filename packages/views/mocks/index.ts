/** UX mocks for the owner's review (strict design): fake data, local state only, nothing wired. */
import projects from "./projects.view.json" with { type: "json" };
import identity from "./identity.view.json" with { type: "json" };
import files from "./files.view.json" with { type: "json" };
import newNote from "./newNote.view.json" with { type: "json" };
import names from "./names.view.json" with { type: "json" };
import quick from "./quick.view.json" with { type: "json" };
import migrate from "./migrate.view.json" with { type: "json" };
import rewrite from "./rewrite.view.json" with { type: "json" };
import images from "./images.view.json" with { type: "json" };
import data from "./data.json" with { type: "json" };

export const mocks: Record<string, unknown> = Object.fromEntries([projects, identity, files, newNote, names, quick, migrate, rewrite, images].map((d) => [d.id, d]));
export const mockData: Record<string, unknown> = data;
