import type { ReactNode } from "react";
import { DialogPanel } from "../../primitives/DialogPanel/DialogPanel.tsx";
import { Heading } from "../../primitives/Heading/Heading.tsx";
import { IconButton } from "../../primitives/IconButton/IconButton.tsx";
import { Inline } from "../../layouts/Inline/Inline.tsx";
import { IconLayout } from "../../layouts/IconLayout/IconLayout.tsx";

export interface DialogProps {
  title: string;
  closeLabel: string;
  open?: boolean;
  size?: "s" | "m" | "l" | "xl";
  /** stable: at least 400 px without shrinking; content: top-anchored confirmation; adaptive: always centred as content changes. */
  height?: "stable" | "content" | "navigation" | "adaptive";
  /** Controls that stay above the scrolling body. */
  toolbar?: ReactNode;
  /** Actions that stay below the scrolling body. */
  footer?: ReactNode;
  /** An icon or visual: the dialog becomes one IconLayout, the visual alone in column 1 (D-408). */
  visual?: ReactNode;
  id?: string;
  children?: ReactNode;
  /** False for full-bleed body regions whose immediate child layouts own their insets. */
  contentInset?: boolean;
  onOpenChange?: (payload: { open: boolean }) => void;
}

/** A titled modal dialog with a close button (IA-CMP-DIALOG). */
export function Dialog({ title, closeLabel, open, size = "l", height = "stable", contentInset = true, toolbar, footer, visual, id, children, onOpenChange }: DialogProps) {
  const close = <IconButton icon="dismiss" label={closeLabel} tone="muted" bleed onPress={() => onOpenChange?.({ open: false })} />;
  // With a visual, the title, close, body and actions all sit in column 2 beside it; the actions trail (D-408).
  if (visual) {
    return (
      <DialogPanel
        label={title}
        {...(open !== undefined ? { open } : {})}
        size={size}
        height={height}
        contentInset={contentInset}
        {...(id ? { id } : {})}
        {...(onOpenChange ? { onOpenChange } : {})}
        {...(toolbar ? { fixed: toolbar } : {})}
      >
        <IconLayout icon={visual} heading={<Inline justify="between" gap="inlineItem" align="start"><Heading level="2" value={title} />{close}</Inline>} actions={footer}>
          {children}
        </IconLayout>
      </DialogPanel>
    );
  }
  return (
    <DialogPanel
      label={title}
      {...(open !== undefined ? { open } : {})}
      size={size}
      height={height}
      contentInset={contentInset}
      {...(id ? { id } : {})}
      {...(onOpenChange ? { onOpenChange } : {})}
      header={
        <Inline justify="between" gap="inlineItem">
          <Heading level="2" value={title} />
          {close}
        </Inline>
      }
      {...(toolbar ? { fixed: toolbar } : {})}
      {...(footer ? { footer } : {})}
    >
      {children}
    </DialogPanel>
  );
}
