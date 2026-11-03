import type { ReactNode } from "react";
import type { ProjectAccent } from "../../primitives/ProjectMark/presets.ts";
import * as s from "./ProjectScope.css.ts";

export interface ProjectScopeProps {
  accent?: ProjectAccent | "app";
  /** Follow app, or the project's own Light or Dark (D-313). */
  appearance?: "follow" | "light" | "dark";
  part?: keyof typeof s.part;
  grow?: boolean;
  children?: ReactNode;
}

/** A project's accent and Appearance over a subtree: token scopes, never per-component overrides (D-313). */
export function ProjectScope({ accent = "app", appearance = "follow", part = "plain", grow = false, children }: ProjectScopeProps) {
  return (
    <div
      className={`${s.base} ${s.part[part]}${grow ? ` ${s.grow}` : ""}`}
      data-project-accent={accent === "app" ? undefined : accent}
      data-theme-scope={appearance === "light" ? "paper" : appearance === "dark" ? "ink" : undefined}
      data-project-part={part}
    >
      {children}
    </div>
  );
}
