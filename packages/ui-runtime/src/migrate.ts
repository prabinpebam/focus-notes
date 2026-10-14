/**
 * The UI schema's versions (DSY-10; Views as data → Versions and migration). Every view document
 * names its version in `$schema` (`…/schemas/ui/view.v<major>.json`). Additions are minor and need
 * nothing; a breaking change bumps the major and adds the migration from the major before it, which
 * rewrites every view document. Documents are migrated before they're validated, and one written
 * for a newer major than this app's is refused with a clear error, never guessed at.
 */

/** The UI schema's major version this app renders. */
export const UI_SCHEMA_MAJOR = 1;
export const viewSchemaUrl = (major: number) => `https://prabinpebam.github.io/focus-notes/schemas/ui/view.v${major}.json`;
export const VIEW_SCHEMA_URL = viewSchemaUrl(UI_SCHEMA_MAJOR);

export type ViewDoc = { $schema: string } & Record<string, unknown>;
/** Rewrites a document from the major it's keyed by to the next one. */
export type ViewMigration = (doc: ViewDoc) => ViewDoc;

/** The migrations, keyed by the major they start from. Empty while the schema is at its first major. */
export const VIEW_MIGRATIONS: Readonly<Record<number, ViewMigration>> = {};

export class ViewSchemaError extends Error {
  override name = "ViewSchemaError";
}

/** The major version a document names in `$schema`. */
export function schemaMajor(doc: unknown): number {
  const url = (doc as { $schema?: unknown } | null)?.$schema;
  const m = typeof url === "string" ? /\/schemas\/ui\/view\.v(\d+)\.json$/.exec(url) : null;
  if (!m) throw new ViewSchemaError(`"$schema" should name the UI schema's version, like ${VIEW_SCHEMA_URL}`);
  return Number(m[1]);
}

/**
 * The document at this app's major: unchanged when it's current, migrated one major at a time when
 * it's older. A newer major, or an older one with a missing step, is refused.
 */
export function migrateView(doc: unknown, migrations: Readonly<Record<number, ViewMigration>> = VIEW_MIGRATIONS, current = UI_SCHEMA_MAJOR): ViewDoc {
  const from = schemaMajor(doc);
  const id = String((doc as { id?: unknown }).id ?? "?");
  if (from > current) throw new ViewSchemaError(`The view "${id}" is written for UI schema v${from}, newer than this app's v${current}. Update the app to open it.`);
  let out = doc as ViewDoc;
  for (let major = from; major < current; major++) {
    const step = migrations[major];
    if (!step) throw new ViewSchemaError(`No migration from UI schema v${major} to v${major + 1} for the view "${id}".`);
    out = { ...step(out), $schema: viewSchemaUrl(major + 1) };
  }
  return out;
}

/** Every major before the current one has its migration: a major bump can't ship without one. */
export function missingMigrations(migrations: Readonly<Record<number, ViewMigration>> = VIEW_MIGRATIONS, current = UI_SCHEMA_MAJOR): number[] {
  return Array.from({ length: current - 1 }, (_, i) => i + 1).filter((m) => !migrations[m]);
}
