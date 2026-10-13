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
  id?: string;
  children?: ReactNode;
  onOpenChange?: (payload: { open: boolean }) => void;
}

/**
 * A modal dialog over a dimmed canvas (Foundations → Surfaces, layer 5). Focus stays inside while
 * it's open and returns where it was when it closes. Esc and clicking the scrim close it.
 */
export function DialogPanel({ label, open, size = "l", header, fixed, id, children, onOpenChange }: DialogPanelProps) {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  useAutoHideScrollbar(bodyRef, Boolean(open));
  return (
    <ModalOverlay className={s.overlay} isOpen={Boolean(open)} isDismissable onOpenChange={(o) => onOpenChange?.({ open: o })}>
      <Modal className={`${s.modal} ${s.size[size]}`}>
        <Dialog className={s.dialog} aria-label={label} {...(id ? { id } : {})}>
          {header ? <div className={s.region}>{header}</div> : null}
          {fixed ? <div className={s.region}>{fixed}</div> : null}
          {/* The body can take focus so its content can be scrolled from the keyboard, even when nothing in it is actionable. */}
          <div className={s.body} ref={bodyRef} data-dialog-body="" tabIndex={0} role="region" aria-label={label}>{children}</div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
