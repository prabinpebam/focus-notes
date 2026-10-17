import * as s from "./Text.css.ts";

export interface TextProps {
  value: string;
  role?: keyof typeof s.role;
  tone?: keyof typeof s.tone;
  lines?: keyof typeof s.lines;
  /** Announces changes politely, for counts and results (a status live region). */
  announce?: boolean;
  /** `control`: inset like a button's label, to lead a row of buttons (D-111). */
  inset?: keyof typeof s.inset;
  /** The person's own words (their invite message), not the interface's: the visual score doesn't count them (D-127, D-143). */
  personal?: boolean;
  /** Pressed, it opens something (D-189): its name says what, the text staying as it looks. */
  label?: string;
  id?: string;
  onPress?: () => void;
}

export function Text({ value, role = "body", tone = "default", lines = "none", announce, inset = "none", personal, label, id, onPress }: TextProps) {
  const classes = [s.base, s.role[role], s.tone[tone], s.lines[lines], s.inset[inset]];
  // A text that opens something (the repository, a profile): a button that still reads as the text.
  if (onPress) {
    return (
      <button type="button" id={id} className={[...classes, s.link].join(" ")} dir="auto" aria-label={label || undefined} title={label || undefined} onClick={() => onPress()}>
        {value}
      </button>
    );
  }
  return (
    <span id={id} className={[s.base, s.role[role], s.tone[tone], s.lines[lines], s.inset[inset]].join(" ")} dir="auto" data-inset={inset === "none" ? undefined : inset} data-personal={personal ? "" : undefined} {...(announce ? { role: "status", "aria-live": "polite" as const } : {})}>
      {value}
    </span>
  );
}
