import {
  Book20Regular, Briefcase20Regular, Beaker20Regular, Heart20Regular, Star20Regular, LeafOne20Regular, Rocket20Regular,
  Lightbulb20Regular, MusicNote220Regular, Camera20Regular, PeopleTeam20Regular, Home20Regular, Airplane20Regular,
  CodeBlock20Regular, PaintBrush20Regular, Trophy20Regular, Earth20Regular, Food20Regular, Building20Regular, Chat20Regular,
  Diamond20Regular, Flag20Regular, Sparkle20Regular, Pen20Regular,
} from "@fluentui/react-icons";
import type { ComponentType, SVGProps } from "react";
import type { ProjectAccent, ProjectLogo } from "./presets.ts";
import { CommitMark, type CommitState } from "../CommitMark/CommitMark.tsx";
import * as s from "./ProjectMark.css.ts";

/** Licensed catalogue geometry (Fluent UI System Icons, MIT), never hand-drawn familiar marks (D-313). */
const LOGOS: Record<ProjectLogo, ComponentType<SVGProps<SVGSVGElement>>> = {
  book: Book20Regular, briefcase: Briefcase20Regular, beaker: Beaker20Regular, heart: Heart20Regular, star: Star20Regular,
  leaf: LeafOne20Regular, rocket: Rocket20Regular, lightbulb: Lightbulb20Regular, music: MusicNote220Regular,
  camera: Camera20Regular, people: PeopleTeam20Regular, home: Home20Regular, airplane: Airplane20Regular, code: CodeBlock20Regular,
  brush: PaintBrush20Regular, trophy: Trophy20Regular, earth: Earth20Regular, food: Food20Regular, building: Building20Regular,
  chat: Chat20Regular, diamond: Diamond20Regular, flag: Flag20Regular, sparkle: Sparkle20Regular, pen: Pen20Regular,
};

export interface ProjectMarkProps {
  logo?: ProjectLogo | "upload" | "none";
  /** An uploaded logo: a data URL of the sanitized SVG the shell made, drawn as an image. */
  src?: string;
  /** Shown without a logo: the project name's first letter. */
  initials?: string;
  accent?: ProjectAccent | "app";
  plate?: keyof typeof s.plate;
  size?: keyof typeof s.size;
  /** The chosen preset in the logo picker. */
  selected?: boolean;
  value?: string;
  choice?: string;
  commit?: CommitState;
  /** Only where the mark stands for the project on its own; required when it can be pressed. */
  label?: string;
  /** A choice in the logo or colour picker: the mark is a toggle button, pressed when selected. */
  onPress?: () => void;
  onChange?: (event: { value: string }) => void;
}

/** A project's mark: its logo on its accent's plate, or its initial (D-313). */
export function ProjectMark({ logo = "none", src, initials, accent = "app", plate = "tint", size = "m", selected: explicitSelected = false, value, choice, commit, label, onPress, onChange }: ProjectMarkProps) {
  const selected = choice !== undefined && value !== undefined ? choice === value : explicitSelected;
  const Glyph = logo !== "none" && logo !== "upload" ? LOGOS[logo] : undefined;
  const upload = logo === "upload" && src?.startsWith("data:image/svg+xml") ? src : undefined;
  const inner = Glyph ? <Glyph className={`${s.glyph} ${s.glyphSize[size]}`} aria-hidden="true" />
    : upload ? <img className={`${s.glyph} ${s.glyphSize[size]}`} src={upload} alt="" draggable={false} />
    : <span className={s.initials}>{initials?.slice(0, 1)}</span>;
  if (onPress || onChange || choice !== undefined) return (
    <button
      type="button"
      className={`${s.base} ${s.size[size]} ${s.plate[plate]} ${s.choice}${selected && (!commit || commit === "rest") ? ` ${s.selected}` : ""}`}
      data-project-accent={accent === "app" ? undefined : accent}
      data-project-mark={size}
      aria-pressed={selected}
      aria-label={label}
      aria-disabled={commit === "pending" || undefined}
      aria-busy={selected && commit === "pending" || undefined}
      data-commit={selected ? commit : undefined}
      title={label}
      onClick={() => {
        if (commit === "pending") return;
        if (choice !== undefined) onChange?.({ value: choice });
        onPress?.();
      }}
    >{inner}{selected && commit ? <CommitMark variant="border" state={commit} /> : null}</button>
  );
  return (
    <span
      className={`${s.base} ${s.size[size]} ${s.plate[plate]}${selected ? ` ${s.selected}` : ""}${size === "watermark" ? ` ${s.watermark}` : ""}`}
      data-project-accent={accent === "app" ? undefined : accent}
      data-project-mark={size}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      {inner}
    </span>
  );
}
