/**
 * Watching the workspace's folder tree for changes made outside the app (PRF-11, D-92). Windows and
 * macOS watch a whole tree natively. Linux has no such watch: Node emulates `recursive` there by
 * polling each file's details every few seconds, so a file Git replaces (deleted and written again,
 * as `git reset` and `git checkout` do) can go unseen. There, each folder gets a watch of its own
 * (inotify reports every name created, deleted, or written in a folder at once), hidden folders and
 * `node_modules` are skipped, and folders that come and go get and lose theirs as they do.
 */
import { readdirSync, statSync, watch, type FSWatcher } from "node:fs";
import { join, relative, sep } from "node:path";

export interface TreeWatcher {
  close(): void;
}


/**
 * Calls `onChange` with the path, relative to `root` (with the system's separator), of every file
 * or folder created, deleted, or written under it. On Linux, hidden folders other than `hidden`'s
 * and `node_modules` aren't watched. Throws when `root` can't be watched at all.
 */
export function watchTree(root: string, onChange: (rel: string) => void, opts: { hidden?: readonly string[]; platform?: NodeJS.Platform } = {}): TreeWatcher {
  const platform = opts.platform ?? process.platform;
  /** A folder a watch never descends into: hidden ones (`.git`), unless asked for, and `node_modules`. */
  const skipped = (name: string) => (name.startsWith(".") && !opts.hidden?.includes(name)) || name === "node_modules";
  if (platform !== "linux") {
    const w = watch(root, { recursive: true }, (_event, name) => {
      if (name) onChange(name.toString());
    });
    // An error ends this watch only; the app goes on without live updates.
    w.on("error", () => w.close());
    return { close: () => w.close() };
  }
  const watchers = new Map<string, FSWatcher>();
  let closed = false;
  const unwatch = (dir: string) => {
    for (const [d, w] of watchers) {
      if (d === dir || d.startsWith(dir + sep)) {
        w.close();
        watchers.delete(d);
      }
    }
  };
  const add = (dir: string) => {
    if (closed || watchers.has(dir)) return;
    let w: FSWatcher;
    try {
      w = watch(dir, (_event, name) => {
        if (!name) return;
        const path = join(dir, name.toString());
        onChange(relative(root, path));
        // A folder that appeared gets its own watch (and its folders theirs); one that went loses it.
        let isDir = false;
        try {
          isDir = statSync(path).isDirectory();
        } catch {
          unwatch(path);
        }
        if (isDir && !skipped(name.toString())) add(path);
      });
    } catch {
      return; // Gone already, or not readable: nothing to watch.
    }
    w.on("error", () => unwatch(dir));
    watchers.set(dir, w);
    let entries: string[] = [];
    try {
      entries = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && !skipped(e.name)).map((e) => e.name);
    } catch {
      // Gone meanwhile: its watch reports or errors.
    }
    for (const e of entries) add(join(dir, e));
  };
  add(root);
  if (!watchers.has(root)) throw new Error("The folder can't be watched");
  return {
    close() {
      closed = true;
      for (const w of watchers.values()) w.close();
      watchers.clear();
    },
  };
}
