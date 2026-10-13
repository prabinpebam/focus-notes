import { lazy, Suspense } from "react";
import type { FileTreeProps } from "./FileTree.tsx";

/** The tree's code and styles load when the Files panel first opens, not with the first paint (PRF-11). */
const Tree = lazy(() => import("./FileTree.tsx").then((m) => ({ default: m.FileTree })));

export function FileTree(props: FileTreeProps) {
  return (
    <Suspense fallback={null}>
      <Tree {...props} />
    </Suspense>
  );
}
