import { lazy, Suspense } from "react";
import type { FileTreeProps } from "./FileTree.tsx";

/** The tree's code and styles, loaded once: by the warm-up after start (PRF-10) or when the Files panel first opens. */
let loading: Promise<typeof import("./FileTree.tsx")> | undefined;
export const preloadFileTree = () => (loading ??= import("./FileTree.tsx"));

/** The tree's code and styles load when the Files panel first opens, not with the first paint (PRF-11). */
const Tree = lazy(() => preloadFileTree().then((m) => ({ default: m.FileTree })));

export function FileTree(props: FileTreeProps) {
  return (
    <Suspense fallback={null}>
      <Tree {...props} />
    </Suspense>
  );
}
