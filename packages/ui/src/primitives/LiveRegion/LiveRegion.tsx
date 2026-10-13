import { useEffect, useState } from "react";
import * as s from "./LiveRegion.css.ts";

export interface LiveRegionProps {
  message: string;
  /** Changes whenever the message should be announced again, even if the words are the same. */
  announceKey?: number;
  id?: string;
}

/** A polite announcement for screen readers, with nothing on screen (PRF-08: waits and their ends). */
export function LiveRegion({ message, announceKey = 0, id }: LiveRegionProps) {
  const [text, setText] = useState("");
  useEffect(() => {
    // Clearing first makes screen readers read a repeated message again.
    setText("");
    const h = requestAnimationFrame(() => setText(message));
    return () => cancelAnimationFrame(h);
  }, [message, announceKey]);
  return <span id={id} role="status" aria-live="polite" aria-atomic="true" className={s.region}>{text}</span>;
}
