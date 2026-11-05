import type { Editor } from "@tiptap/react";
import { createRoot } from "react-dom/client";
import { syncSelection, type NodeViewRenderer } from "@focus-notes/editor";
import { ImageFrame } from "../../primitives/ImageFrame/ImageFrame.tsx";
import { TextMenu } from "../TextMenu/TextMenu.tsx";
import { FullAppOverlay } from "../../layouts/AppRoot/in-window.tsx";
import * as styles from "./image-view.css.ts";
import type { ImageSource, MenuSection } from "../../data.ts";

export interface ImagePayload { pos: number; src: string; alt?: string; text?: boolean; announce?: boolean; rounded: boolean; fitHeight: boolean; mode: string; width: number; height: number; from: number; to: number; count: number; roundMixed: boolean; limitMixed: boolean }
export interface ImageViewOptions {
  documentKey: string;
  sources: ImageSource[];
  menu: MenuSection[];
  menuLabel: string;
  missing: string;
  retryLabel: string;
  retryBusyLabel: string;
  loadingLabel: string;
  read?: (payload: { src: string; key: string }) => void;
  retry?: (payload: { src: string; key: string }) => void;
  failed?: (payload: { src: string; value: string; key: string }) => void;
  select?: (payload: ImagePayload) => void;
  action?: (payload: { id: string }) => void;
}

export function captureImageSelection(editor: Editor): ImagePayload {
  const { from, to } = editor.state.selection;
  const images: { pos: number; src: string; alt: string; rounded: boolean; fitHeight: boolean; mode: string }[] = [];
  editor.state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name === "image") images.push({ pos, src: String(node.attrs.src), alt: String(node.attrs.alt ?? ""), rounded: node.attrs.rounded === true, fitHeight: node.attrs.fitHeight !== false, mode: String(node.attrs.mode) });
  });
  const rounded = images.length > 0 && images.every((i) => i.rounded);
  const fitHeight = images.length > 0 && images.every((i) => i.fitHeight);
  return { pos: -1, src: "", mode: "column", ...images[0], rounded, fitHeight, width: 0, height: 0, from, to, count: images.length,
    text: editor.state.selection.toJSON().type !== "node", roundMixed: !rounded && images.some((i) => i.rounded), limitMixed: !fitHeight && images.some((i) => i.fitHeight) };
}

function ImageNode({ payload, selected, options, select, capture, menu, openMenu, onSize }: { payload: ImagePayload; selected: boolean; options: ImageViewOptions; select: (focus?: boolean) => void; capture: () => ImagePayload; menu: { request: number; x: number; y: number }; openMenu: (point: { x: number; y: number }) => void; onSize: (size: { width: number; height: number }) => void; }) {
  const source = options.sources.find((s) => s.id === payload.src);
  const control = (target: EventTarget) => target instanceof Element && target.closest("button, [data-floating-child]");
  return <span onClick={(e) => { if (!control(e.target)) select(true); }} onMouseDown={(e) => { if (control(e.target)) return; e.preventDefault(); if (e.button === 2) e.stopPropagation(); }}>
    <ImageFrame src={source?.value ?? ""} alt={payload.alt} mode={payload.mode === "wide" || payload.mode === "actual" ? payload.mode : "column"} rounded={payload.rounded} fitHeight={payload.fitHeight} selected={selected} inSelection={!selected && payload.text && payload.count > 0}
      intrinsicWidth={payload.width || undefined} intrinsicHeight={payload.height || undefined} loadingLabel={options.loadingLabel}
      broken={source?.failed} error={options.missing} retryLabel={options.retryLabel} retryBusy={source?.pending} retryBusyLabel={options.retryBusyLabel}
      onRetry={() => options.retry?.({ src: payload.src, key: options.documentKey })}
      onError={() => options.failed?.({ src: payload.src, value: source?.value ?? "", key: options.documentKey })}
      onSize={onSize} onContextMenu={(point) => { select(); options.select?.(capture()); openMenu(point); }} />
    <FullAppOverlay><TextMenu label={options.menuLabel} sections={options.menu} {...menu} onAction={options.action} /></FullAppOverlay>
  </span>;
}

export function imageView(options: () => ImageViewOptions, renders: Set<() => void>): NodeViewRenderer {
  return ({ node, editor, getPos }) => {
    const dom = document.createElement("div");
    dom.contentEditable = "false";
    dom.dataset.imageNode = "";
    const root = createRoot(dom);
    const key = options().documentKey;
    let alive = true;
    let current = node;
    let selected = false;
    let size = { width: Number(node.attrs.width) || 0, height: Number(node.attrs.height) || 0 };
    let menu = { request: 0, x: 0, y: 0 };
    const select = (focus = false) => {
      const pos = getPos();
      if (typeof pos !== "number") return;
      syncSelection(editor);
      const selection = editor.state.selection;
      if (!focus && !selection.empty && pos >= selection.from && pos < selection.to) return;
      editor.commands.setNodeSelection(pos);
      editor.view.focus();
    };
    const capture = (): ImagePayload => {
      const pos = getPos();
      const selection = editor.state.selection;
      const inRange = typeof pos === "number" && !selection.empty && pos >= selection.from && pos < selection.to;
      if (inRange) return { ...captureImageSelection(editor), ...size };
      const roundAll = current.attrs.rounded === true;
      const limitAll = current.attrs.fitHeight !== false;
      return { pos: typeof pos === "number" ? pos : -1, src: String(current.attrs.src), alt: String(current.attrs.alt ?? ""), rounded: roundAll, fitHeight: limitAll, mode: String(current.attrs.mode), ...size,
        from: typeof pos === "number" ? pos : 0, to: typeof pos === "number" ? pos + current.nodeSize : 0, count: 1,
        roundMixed: false, limitMixed: false };
    };
    const render = () => {
      if (!alive || options().documentKey !== key) return;
      const payload = capture();
      const selection = editor.state.selection;
      const inRange = !selection.empty && payload.pos >= selection.from && payload.pos < selection.to;
      dom.className = inRange && payload.text ? styles.textSelection : "";
      dom.toggleAttribute("data-image-text-selection", Boolean(inRange && payload.text));
      root.render(<ImageNode payload={{ ...payload, src: String(current.attrs.src), alt: String(current.attrs.alt ?? ""), rounded: current.attrs.rounded === true, fitHeight: current.attrs.fitHeight !== false, mode: String(current.attrs.mode) }} selected={selected} options={options()} select={select} capture={capture} menu={menu} onSize={(value) => { size = value; }} openMenu={(point) => { menu = { request: menu.request + 1, ...point }; render(); }} />);
    };
    const openMenu = () => {
      const r = dom.getBoundingClientRect();
      menu = { request: menu.request + 1, x: r.left + r.width / 2, y: r.top + r.height / 2 };
      options().select?.(capture());
      render();
    };
    dom.addEventListener("image-contextmenu", openMenu);
    const selectImage = () => select(true);
    dom.addEventListener("image-select", selectImage);
    editor.on("selectionUpdate", render);
    renders.add(render);
    const requestRead = () => {
      const src = String(current.attrs.src);
      queueMicrotask(() => {
        if (!alive || options().documentKey !== key || String(current.attrs.src) !== src) return;
        options().read?.({ src, key });
        render();
      });
    };
    requestRead();
    return {
      dom,
      update(next) { if (next.type !== current.type) return false; const changed = next.attrs.src !== current.attrs.src; current = next; if (changed) { size = { width: Number(next.attrs.width) || 0, height: Number(next.attrs.height) || 0 }; requestRead(); } render(); return true; },
      selectNode() { selected = true; options().select?.({ ...capture(), announce: true }); render(); },
      deselectNode() { selected = false; render(); },
      stopEvent: (e) => e.type === "contextmenu",
      ignoreMutation: () => true,
      destroy() { alive = false; renders.delete(render); editor.off("selectionUpdate", render); dom.removeEventListener("image-contextmenu", openMenu); dom.removeEventListener("image-select", selectImage); queueMicrotask(() => root.unmount()); },
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
