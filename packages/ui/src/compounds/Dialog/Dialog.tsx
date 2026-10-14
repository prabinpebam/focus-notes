import type { ReactNode } from "react";
import { DialogPanel } from "../../primitives/DialogPanel/DialogPanel.tsx";
import { Heading } from "../../primitives/Heading/Heading.tsx";
import { IconButton } from "../../primitives/IconButton/IconButton.tsx";
import { Inline } from "../../layouts/Inline/Inline.tsx";

export interface DialogProps {
  title: string;
  closeLabel: string;
  open?: boolean;
  size?: "s" | "l" | "xl";
  /** Controls that stay above the scrolling body. */
  toolbar?: ReactNode;
  id?: string;
  children?: ReactNode;
  onOpenChange?: (payload: { open: boolean }) => void;
}

/** A titled modal dialog with a close button (IA-CMP-DIALOG). */
export function Dialog({ title, closeLabel, open, size = "l", toolbar, id, children, onOpenChange }: DialogProps) {
  return (
    <DialogPanel
      label={title}
      {...(open !== undefined ? { open } : {})}
      size={size}
      {...(id ? { id } : {})}
      {...(onOpenChange ? { onOpenChange } : {})}
      header={
        <Inline justify="between" gap="m">
          <Heading level="2" value={title} />
          <IconButton icon="dismiss" label={closeLabel} tone="muted" bleed onPress={() => onOpenChange?.({ open: false })} />
        </Inline>
      }
      {...(toolbar ? { fixed: toolbar } : {})}
    >
      {children}
    </DialogPanel>
  );
}
