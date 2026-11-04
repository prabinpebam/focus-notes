import { useId } from "react";
import { IconButton } from "../IconButton/IconButton.tsx";
import * as s from "./CodeBlock.css.ts";

export interface CodeBlockProps {
  value: string;
  label?: string;
  copyLabel: string;
  size?: "m" | "l";
  id?: string;
  onCopy?: () => void;
}

/** A command or a one-time code, in monospace with its own Copy (D-142). */
export function CodeBlock({ value, label, copyLabel, size = "m", id, onCopy }: CodeBlockProps) {
  const labelId = useId();
  return (
    <div id={id} className={s.root} role="group" aria-labelledby={label ? labelId : undefined} data-code-block={size}>
      {label ? <span id={labelId} className={s.label} dir="auto">{label}</span> : null}
      <div className={`${s.box} ${s.box_[size]}`}>
        <code className={`${s.code} ${s.code_[size]}`} data-personal="">{value}</code>
        <div className={s.copy}><IconButton label={copyLabel} icon="copy" {...(onCopy ? { onPress: onCopy } : {})} /></div>
      </div>
    </div>
  );
}
