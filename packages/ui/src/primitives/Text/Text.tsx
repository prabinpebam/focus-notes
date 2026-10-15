import * as s from "./Text.css.ts";

export interface TextProps {
  value: string;
  role?: keyof typeof s.role;
  tone?: keyof typeof s.tone;
  lines?: keyof typeof s.lines;
  /** Announces changes politely, for counts and results (a status live region). */
  announce?: boolean;
  id?: string;
}

export function Text({ value, role = "body", tone = "default", lines = "none", announce, id }: TextProps) {
  return (
    <span id={id} className={[s.base, s.role[role], s.tone[tone], s.lines[lines]].join(" ")} dir="auto" {...(announce ? { role: "status", "aria-live": "polite" as const } : {})}>
      {value}
    </span>
  );
}
