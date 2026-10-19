/**
 * The Microsoft Store build (PKG-12, D-202). Electron sets `process.windowsStore` when the app runs
 * from its MSIX package. There the install folder is read-only and its path changes with every
 * version, so nothing may point into it or write there:
 * - Windows registers the `focus-notes:` scheme from the package's manifest, so the app doesn't;
 * - the command-line tool is the package's `focus-notes` alias, which Windows keeps on every user's
 *   `PATH`, instead of the launchers' folder added to `Path` (install-cli.ts);
 * - `%APPDATA%` is the package's own (Windows redirects its writes), so the app's data folder needs
 *   no change and is removed with the app; the notes live in the workspace, which isn't.
 */
import { join } from "node:path";

/** Whether this process runs from the Store's package. */
export const isStoreBuild = (p: { windowsStore?: boolean } = process): boolean => p.windowsStore === true;

/** The package's alias, the same path for every version: what agents' connection snippets start. */
export const storeAliasPath = (localAppData: string): string => join(localAppData, "Microsoft", "WindowsApps", "focus-notes.exe");

/**
 * The command a process was started for, or undefined when it's the app (D-165). `--cli` as the
 * very first argument, which the launchers and the connection snippets add; in the Store build also
 * a first argument that isn't a switch, because the alias passes only what the person typed
 * (`focus-notes ls`), while `focus-notes` alone opens the app. Never alongside a deep link, so a
 * link can't turn into a command.
 */
export function cliArgv(argv: readonly string[], o: { packaged: boolean; store: boolean }): string[] | undefined {
  if (argv.some((a) => /^focus-notes:/i.test(a))) return undefined;
  const first = o.packaged ? 1 : 2;
  const a = argv[first];
  if (a === undefined) return undefined;
  if (a === "--cli") return argv.slice(first + 1);
  if (o.store && o.packaged && !a.startsWith("-")) return argv.slice(first);
  return undefined;
}
