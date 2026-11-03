import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { syncSelection, type NodeViewRenderer } from "@focus-notes/editor";
import { Popover } from "react-aria-components";
import { ImageFrame } from "../../primitives/ImageFrame/ImageFrame.tsx";
import { CommandMenu } from "../../primitives/MenuButton/MenuButton.tsx";
import { Spinner } from "../../primitives/Spinner/Spinner.tsx";
import { Text } from "../../primitives/Text/Text.tsx";
import { useWindowBoundary } from "../../layouts/AppRoot/in-window.tsx";
import * as menuStyles from "../../primitives/MenuButton/MenuButton.css.ts";
import type { ColorValue, MenuSection } from "../../data.ts";

export interface ImagePayload { pos: number; src: string; alt?: string; rounded: boolean; fitHeight: boolean; mode: string; width: number; height: number; from: number; to: number; count: number; roundMixed: boolean; limitMixed: boolean }
export interface ImageViewOptions {
  sources: ColorValue[];
  menu: MenuSection[];
  menuLabel: string;
  missing: string;
  read?: (payload: { src: string }) => void;
  select?: (payload: ImagePayload) => void;
  action?: (payload: { id: string }) => void;
}

function ImageNode({ payload, selected, options, select, capture }: { payload: ImagePayload; selected: boolean; options: ImageViewOptions; select: (focus?: boolean) => void; capture: () => ImagePayload }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const boundary = useWindowBoundary();
  const source = options.sources.find((s) => s.id === payload.src);
  const [size, setSize] = useState({ width: 0, height: 0 });
  return <span ref={ref} onClick={() => select(true)} onMouseDown={(e) => { if (e.button === 2) { e.preventDefault(); e.stopPropagation(); } }}>
    {source?.value ? <ImageFrame src={source.value} alt={payload.alt} mode={payload.mode === "wide" || payload.mode === "actual" ? payload.mode : "column"} rounded={payload.rounded} fitHeight={payload.fitHeight} selected={selected}
      onSize={setSize} onContextMenu={() => { select(); options.select?.({ ...capture(), ...size }); setOpen(true); }} />
      : source ? <Text value={options.missing} /> : <Spinner />}
    <Popover isOpen={open} onOpenChange={setOpen} triggerRef={ref} placement="bottom start" className={menuStyles.popover} {...boundary} data-floating-child="">
      <CommandMenu label={options.menuLabel} sections={options.menu} onAction={(p) => { setOpen(false); options.action?.(p); }} />
    </Popover>
  </span>;
}

export function imageView(options: () => ImageViewOptions, renders: Set<() => void>): NodeViewRenderer {
  return ({ node, editor, getPos }) => {
    const dom = document.createElement("div");
    dom.contentEditable = "false";
    dom.dataset.imageNode = "";
    const root = createRoot(dom);
    let current = node;
    let selected = false;
    const select = (focus = false) => {
      const pos = getPos();
      if (typeof pos !== "number") return;
      syncSelection(editor);
      const selection = editor.state.selection;
      if (!focus && !selection.empty && pos >= selection.from && pos < selection.to) return;
      editor.commands.setNodeSelection(pos);
      if (focus) requestAnimationFrame(() => dom.querySelector<HTMLElement>("[data-selected]")?.focus({ preventScroll: true }));
    };
    const capture = (): ImagePayload => {
      const pos = getPos();
      const selection = editor.state.selection;
      const inRange = typeof pos === "number" && !selection.empty && pos >= selection.from && pos < selection.to;
      const images: { rounded: boolean; fitHeight: boolean }[] = [];
      if (inRange) editor.state.doc.nodesBetween(selection.from, selection.to, (node) => { if (node.type.name === "image") images.push({ rounded: node.attrs.rounded === true, fitHeight: node.attrs.fitHeight !== false }); });
      const roundAll = images.length ? images.every((i) => i.rounded) : current.attrs.rounded === true;
      const limitAll = images.length ? images.every((i) => i.fitHeight) : current.attrs.fitHeight !== false;
      return { pos: typeof pos === "number" ? pos : -1, src: String(current.attrs.src), alt: String(current.attrs.alt ?? ""), rounded: roundAll, fitHeight: limitAll, mode: String(current.attrs.mode), width: 0, height: 0,
        from: inRange ? selection.from : typeof pos === "number" ? pos : 0, to: inRange ? selection.to : typeof pos === "number" ? pos + current.nodeSize : 0, count: images.length || 1,
        roundMixed: !roundAll && images.some((i) => i.rounded), limitMixed: !limitAll && images.some((i) => i.fitHeight) };
    };
    const render = () => {
      const payload = capture();
      const selection = editor.state.selection;
      const inRange = !selection.empty && payload.pos >= selection.from && payload.pos < selection.to;
      root.render(<ImageNode payload={payload} selected={selected || inRange} options={options()} select={select} capture={capture} />);
    };
    editor.on("selectionUpdate", render);
    renders.add(render);
    queueMicrotask(() => { options().read?.({ src: String(current.attrs.src) }); render(); });
    return {
      dom,
      update(next) { if (next.type !== current.type) return false; current = next; render(); return true; },
      selectNode() { selected = true; render(); },
      deselectNode() { selected = false; render(); },
      stopEvent: (e) => e.type === "contextmenu" || e.type === "keydown",
      ignoreMutation: () => true,
      destroy() { renders.delete(render); editor.off("selectionUpdate", render); queueMicrotask(() => root.unmount()); },
    };
  };
}

export async function renderImageEdit(data: string, x: number, y: number, width: number, height: number, rotation: number): Promise<string> {
  const image = new Image();
  image.src = data;
  await image.decode();
  if (![x, y, width, height].every(Number.isFinite) || x < 0 || y < 0 || width < 1 || height < 1 || x + width > image.naturalWidth || y + height > image.naturalHeight) throw new Error("invalid-crop");
  const canvas = document.createElement("canvas");
  canvas.width = rotation % 180 ? height : width;
  canvas.height = rotation % 180 ? width : height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("image-render-failed");
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(rotation * Math.PI / 180);
  ctx.drawImage(image, x, y, width, height, -width / 2, -height / 2, width, height);
  return canvas.toDataURL(data.slice(5, data.indexOf(";")));
}
