import { useRef, type ReactNode } from "react";
import { Dialog, Modal, ModalOverlay } from "react-aria-components";
import { useAutoHideScrollbar } from "../../behaviors/auto-hide-scrollbar.ts";
import * as s from "./DialogPanel.css.ts";

export interface DialogPanelProps {
  /** Names the dialog for assistive technology; the same words as its visible title. */
  label: string;
  open?: boolean;
  size?: keyof typeof s.size;
  /** The title row. */
  header?: ReactNode;
  /** Controls that stay put above the scrolling body, such as a search field and filters. */
  fixed?: ReactNode;
  /** A line that stays below the body, such as Spotlight's key hints. */
  footer?: ReactNode;
  /** Centered, or near the top of the window like Spotlight (about 20% down). */
  placement?: "center" | "top";
  /** The raised surface, or the theme's frosted one (Spotlight). */
  material?: "raised" | "frosted";
  id?: string;
  children?: ReactNode;
  onOpenChange?: (payload: { open: boolean }) => void;
}

/**
 * A modal dialog over a dimmed canvas (Foundations → Surfaces, layer 5). Focus stays inside while
 * it's open and returns where it was when it closes. Esc and clicking the scrim close it.
 */
export function DialogPanel({ label, open, size = "l", header, fixed, footer, placement = "center", material = "raised", id, children, onOpenChange }: DialogPanelProps) {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  useAutoHideScrollbar(bodyRef, Boolean(open));
  return (
    <ModalOverlay className={`${s.overlay} ${s.placement[placement]}`} isOpen={Boolean(open)} isDismissable onOpenChange={(o) => onOpenChange?.({ open: o })}>
      <Modal className={`${s.modal} ${s.size[size]}`}>
        <Dialog className={`${s.dialog} ${s.material[material]}`} aria-label={label} {...(id ? { id } : {})}>
          {header ? <div className={s.region}>{header}</div> : null}
          {fixed ? <div className={s.region}>{fixed}</div> : null}
          {/* The body can take focus so its content can be scrolled from the keyboard, even when nothing in it is actionable. */}
          <div className={s.body} ref={bodyRef} data-dialog-body="" tabIndex={0} role="region" aria-label={label}>{children}</div>
          {footer ? <div className={s.region}>{footer}</div> : null}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
