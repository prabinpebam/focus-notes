/** UX mocks for the owner's review (strict design): fake data, local state only, nothing wired. */
import projects from "./projects.view.json" with { type: "json" };
import identity from "./identity.view.json" with { type: "json" };
import data from "./data.json" with { type: "json" };

export const mocks: Record<string, unknown> = Object.fromEntries([projects, identity].map((d) => [d.id, d]));
export const mockData: Record<string, unknown> = data;
