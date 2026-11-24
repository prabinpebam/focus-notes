import { useId } from "react";
import type { FluentIcon } from "@fluentui/react-icons";

/**
 * Saved on this computer (offline mode): Fluent's HardDrive20Regular with the same check badge as
 * CloudCheckmark20Regular, the Backed up glyph (owner, 23 November 17:06: "Offline mode should be a hard
 * drive with a tick"). Fluent ships no hard-drive-checkmark, so both paths are copied unmodified from
 * @fluentui/react-icons and the drive is cut back around the badge by the 1 px gap Fluent's own badges use.
 */
const DRIVE =
  "M2 12q0-.61.24-1.16l2.41-5.63A2 2 0 0 1 6.5 4h7.1c.75 0 1.43.41 1.77 1.09a55 55 0 0 1 2.45 5.77q.2.56.19 1.14v2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2zm11.6-7H6.48a1 1 0 0 0-.92.6l-1.9 4.43L4 10h12q.23 0 .45.05a57 57 0 0 0-2-4.52A1 1 0 0 0 13.6 5M16 15a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1zm-1.25-1.25a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5";
const BADGE =
  "M18 13.5a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0m-2.85-1.85-2.65 2.64-.65-.64a.5.5 0 0 0-.7.7l1 1c.2.2.5.2.7 0l3-3a.5.5 0 0 0-.7-.7";

export const HardDriveCheckmark = ((props: { className?: string; role?: string; "aria-label"?: string; "aria-hidden"?: boolean | "true" | "false" }) => {
  const mask = `hdc${useId().replace(/:/g, "")}`;
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" focusable="false" data-icon="hardDriveCheck" {...props}>
      <mask id={mask}>
        <rect width="20" height="20" fill="white" />
        <circle cx="13.5" cy="13.5" r="5.5" fill="black" />
      </mask>
      <path d={DRIVE} mask={`url(#${mask})`} />
      <path d={BADGE} />
    </svg>
  );
}) as unknown as FluentIcon;
