import type { ReactNode } from "react";
import type { ProjectAccent, ProjectFont, ProjectTheme } from "../../primitives/ProjectMark/presets.ts";
import * as s from "./ProjectScope.css.ts";

export interface ProjectScopeProps {
  accent?: ProjectAccent | "app";
  /** The project's colour theme, or Follow app (D-316). */
  theme?: ProjectTheme | "app";
  /** The project's writing font, or the app's (D-316). */
  font?: ProjectFont | "app";
  part?: keyof typeof s.part;
  grow?: boolean;
  children?: ReactNode;
}

/** A project's accent, theme and writing font over a subtree: token scopes, never per-component overrides (D-313, D-316). */
export function ProjectScope({ accent = "app", theme = "app", font = "app", part = "plain", grow = false, children }: ProjectScopeProps) {
  return (
    <div
      className={`${s.base} ${s.part[part]}${grow ? ` ${s.grow}` : ""}`}
      data-project-accent={accent === "app" ? undefined : accent}
      data-theme-scope={theme === "app" ? undefined : theme}
      data-font-scope={font === "app" ? undefined : font}
      data-project-part={part}
    >
      {children}
    </div>
  );
}
