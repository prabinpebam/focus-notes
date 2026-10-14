import { useEffect, useRef, type ReactNode } from "react";
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
  /** stable: at least 400 px, and never shorter than it has been since it opened (D-111); content: as tall as its content (confirmations). */
  height?: keyof typeof s.height;
  id?: string;
  children?: ReactNode;
  onOpenChange?: (payload: { open: boolean }) => void;
}

/**
 * A modal dialog over a dimmed canvas (Foundations → Surfaces, layer 5). Focus stays inside while
 * it's open and returns where it was when it closes. Esc and clicking the scrim close it.
 */
export function DialogPanel({ label, open, size = "l", header, fixed, footer, placement = "center", material = "raised", height = "stable", id, children, onOpenChange }: DialogPanelProps) {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  useAutoHideScrollbar(bodyRef, Boolean(open));
  // The tallest it has been since it opened, kept as its least height (D-111). Reset when it closes.
  useEffect(() => {
    const modal = bodyRef.current?.closest<HTMLElement>("[data-dialog-modal]");
    if (!open || !modal || height !== "stable") return;
    let tallest = 0;
    const name = s.grownVar.replace(/^var\(|\)$/g, "");
    const watch = new ResizeObserver(() => {
      // Its layout height: the box as drawn is scaled while it opens.
      const h = modal.offsetHeight;
      if (h <= tallest + 0.5) return;
      tallest = h;
      modal.style.setProperty(name, `${Math.ceil(h)}px`);
    });
    watch.observe(modal);
    return () => {
      watch.disconnect();
      modal.style.removeProperty(name);
    };
  }, [open, height]);
  return (
    <ModalOverlay data-scrim="" className={`${s.overlay} ${s.placement[placement]}`} isOpen={Boolean(open)} isDismissable onOpenChange={(o) => onOpenChange?.({ open: o })}>
      <Modal className={`${s.modal} ${s.size[size]} ${s.height[height]}`} data-dialog-modal="" data-height={height}>
        <Dialog data-surface="dialog" className={`${s.dialog} ${s.material[material]}`} aria-label={label} {...(id ? { id } : {})}>
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
