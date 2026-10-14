import { useId } from "react";
import type { VersionBlock } from "../../data.ts";
import * as s from "./VersionPane.css.ts";

export interface VersionPaneProps {
  label: string;
  blocks: VersionBlock[];
  emptyText: string;
  changedLabel: string;
  id?: string;
}

/**
 * One version of a note, as text (IA-CMP-CONFLICT). It's read, not edited, so it's a labelled
 * region of plain blocks; the blocks that differ are highlighted like find matches, with a mark at
 * their start and a word for screen readers, so the difference never depends on color alone.
 */
export function VersionPane({ label, blocks, emptyText, changedLabel, id }: VersionPaneProps) {
  const headingId = useId();
  return (
    <section id={id} className={s.pane} aria-labelledby={headingId}>
      <h3 id={headingId} className={s.heading} dir="auto">{label}</h3>
      {blocks.length ? (
        <ul className={s.blocks}>
          {blocks.map((b) => (
            <li key={b.id} className={b.changed ? `${s.block} ${s.changed}` : s.block} dir="auto" data-changed={b.changed ? "" : undefined}>
              {b.changed ? <span className={s.hidden}>{`${changedLabel}: `}</span> : null}
              {b.text}
            </li>
          ))}
        </ul>
      ) : (
        <p className={s.empty}>{emptyText}</p>
      )}
    </section>
  );
}
