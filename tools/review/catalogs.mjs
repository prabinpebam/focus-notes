/**
 * The review catalogues (D-146): journeys that capture screenshots for the owner's review. Each names
 * its spec (under apps/desktop), the variables that turn its captures on, and where its files land.
 * The Review captures workflow (.github/workflows/review-captures.yml) runs one on CI at every window
 * size, since the small and large windows resize a real window (D-141), and uploads the folder as the
 * artifact `review-<name>`; tools/review/fetch-captures.mjs downloads it. Locally, a capture only ever
 * takes the default window.
 *
 * To add a catalogue: an entry here, and its name in the workflow's `catalog` choices.
 */
import { join } from "node:path";

export const REVIEW_DIR = join("test-results", "review");

/**
 * - `spec`: the journey file, relative to apps/desktop.
 * - `env`: what turns its captures on.
 * - `outEnv`: the variable naming the folder it writes to, when it takes one; otherwise `from` and
 *   `match` say which files it leaves where, to be copied into the catalogue's folder.
 * - `onlyEnv`: the variable that narrows it to some of its subjects, when it has one.
 */
export const CATALOGS = {
  // First run and setup, every state: `NN-<step>-<state>.<theme>.<size>.png`, index.html, README.md and manifest.json.
  "fre-catalog": { spec: "e2e/fre-catalog.spec.ts", env: { FOCUS_NOTES_CAPTURE_FRE: "1" }, outEnv: "FOCUS_NOTES_FRE_OUT" },
  // Every surface under the visual quality checklist (D-111), light and dark, default and smallest windows.
  // `onlyEnv` narrows it to some surfaces by name ("system menu,more menu").
  "vq-surfaces": { spec: "e2e/vq-surfaces.spec.ts", env: {}, onlyEnv: "VQ_ONLY", from: join("test-results", "screens"), match: /^vq-.*\.png$/ },
};

/** Where a catalogue's files are collected and uploaded from, relative to the repository's root. */
export const outDir = (name) => join(REVIEW_DIR, name);
/** The workflow's artifact for a catalogue. */
export const artifactName = (name) => `review-${name}`;

export function catalog(name) {
  if (!Object.hasOwn(CATALOGS, name)) throw new Error(`No catalogue named "${name}": one of ${Object.keys(CATALOGS).join(", ")} (tools/review/catalogs.mjs).`);
  return CATALOGS[name];
}
