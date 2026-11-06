import type { Editor } from "@tiptap/react";
import { createRoot } from "react-dom/client";
import { syncSelection, setImageWords, closeImageTyping, type NodeViewRenderer } from "@focus-notes/editor";
import { ImageFrame } from "../../primitives/ImageFrame/ImageFrame.tsx";
import { TextMenu } from "../TextMenu/TextMenu.tsx";
import { FullAppOverlay } from "../../layouts/AppRoot/in-window.tsx";
import * as styles from "./image-view.css.ts";
import type { ImageSource, MenuSection } from "../../data.ts";

export interface ImagePayload { pos: number; src: string; originalSrc?: string; alt?: string; title?: string; text?: boolean; announce?: boolean; rounded: boolean; fitHeight: boolean; mode: string; width: number; height: number; from: number; to: number; count: number; roundMixed: boolean; limitMixed: boolean }
export interface ImageViewOptions {
  documentKey: string;
  sources: ImageSource[];
  menu: MenuSection[];
  menuLabel: string;
  missing: string;
  retryLabel: string;
  retryBusyLabel: string;
  loadingLabel: string;
  captionLabel: string;
  read?: (payload: { src: string; key: string }) => void;
  retry?: (payload: { src: string; key: string }) => void;
  failed?: (payload: { src: string; value: string; key: string }) => void;
  select?: (payload: ImagePayload) => void;
  action?: (payload: { id: string }) => void;
}

export function captureImageSelection(editor: Editor): ImagePayload {
  const { from, to } = editor.state.selection;
  const images: { pos: number; src: string; originalSrc: string; alt: string; title: string; rounded: boolean; fitHeight: boolean; mode: string }[] = [];
  let text = false;
  editor.state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.isText && Math.min(to, pos + node.nodeSize) > Math.max(from, pos)) text = true;
    if (node.type.name === "image") images.push({ pos, src: String(node.attrs.src), originalSrc: String(node.attrs.originalSrc ?? ""), alt: String(node.attrs.alt ?? ""), title: String(node.attrs.title ?? ""), rounded: node.attrs.rounded === true, fitHeight: node.attrs.fitHeight !== false, mode: String(node.attrs.mode) });
  });
  const rounded = images.length > 0 && images.every((i) => i.rounded);
  const fitHeight = images.length > 0 && images.every((i) => i.fitHeight);
  return { pos: -1, src: "", mode: "column", ...images[0], rounded, fitHeight, width: 0, height: 0, from, to, count: images.length,
    text, roundMixed: !rounded && images.some((i) => i.rounded), limitMixed: !fitHeight && images.some((i) => i.fitHeight) };
}

function ImageNode({ payload, selected, options, select, capture, menu, openMenu, onSize, captionEditing, onCaptionChange, onCaptionEnd }: { payload: ImagePayload; selected: boolean; options: ImageViewOptions; select: (focus?: boolean) => void; capture: () => ImagePayload; menu: { request: number; x: number; y: number }; openMenu: (point: { x: number; y: number }) => void; onSize: (size: { width: number; height: number }) => void; captionEditing: boolean; onCaptionChange: (value: string) => void; onCaptionEnd: () => void; }) {
  const source = options.sources.find((s) => s.id === payload.src);
  const control = (target: EventTarget) => target instanceof Element && target.closest("button, [data-floating-child], [contenteditable=true]");
  return <span onClick={(e) => { if (!control(e.target)) select(true); }} onMouseDown={(e) => { if (control(e.target)) return; e.preventDefault(); if (e.button === 2) e.stopPropagation(); }}>
    <ImageFrame src={source?.value ?? ""} alt={payload.alt} mode={payload.mode === "wide" || payload.mode === "actual" ? payload.mode : "column"} rounded={payload.rounded} fitHeight={payload.fitHeight} selected={selected} inSelection={!selected && payload.text && payload.count > 0}
      caption={payload.title} captionEditing={captionEditing} captionLabel={options.captionLabel} onCaptionChange={({ value }) => onCaptionChange(value)} onCaptionEnd={onCaptionEnd}
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
    let captionEditing = false;
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
      return { pos: typeof pos === "number" ? pos : -1, src: String(current.attrs.src), originalSrc: String(current.attrs.originalSrc ?? ""), alt: String(current.attrs.alt ?? ""), title: String(current.attrs.title ?? ""), rounded: roundAll, fitHeight: limitAll, mode: String(current.attrs.mode), ...size,
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
      root.render(<ImageNode payload={{ ...payload, src: String(current.attrs.src), alt: String(current.attrs.alt ?? ""), title: String(current.attrs.title ?? ""), rounded: current.attrs.rounded === true, fitHeight: current.attrs.fitHeight !== false, mode: String(current.attrs.mode) }} selected={selected} options={options()} select={select} capture={capture} menu={menu} onSize={(value) => { size = value; }} openMenu={(point) => { menu = { request: menu.request + 1, ...point }; render(); }}
        captionEditing={captionEditing} onCaptionChange={(value) => { const pos = getPos(); if (typeof pos === "number") setImageWords(editor, { pos, src: current.attrs.src }, { title: value || null }, true); }}
        onCaptionEnd={() => { if (!alive || !captionEditing) return; captionEditing = false; closeImageTyping(editor); render(); }} />);
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
    const editCaption = () => { captionEditing = true; closeImageTyping(editor); render(); };
    dom.addEventListener("image-caption", editCaption);
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
      stopEvent: (e) => e.type === "contextmenu" || captionEditing,
      ignoreMutation: () => true,
      destroy() { alive = false; renders.delete(render); editor.off("selectionUpdate", render); dom.removeEventListener("image-contextmenu", openMenu); dom.removeEventListener("image-select", selectImage); dom.removeEventListener("image-caption", editCaption); queueMicrotask(() => root.unmount()); },
    };
  };
}

export async function renderImageEdit(data: string, x: number, y: number, width: number, height: number, rotation: number, flipHorizontal = false, flipVertical = false): Promise<string> {
  const image = new Image();
  image.src = data;
  await image.decode();
  if (![0, 90, 180, 270].includes(rotation) || ![x, y, width, height].every(Number.isFinite) || x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 100.000001 || y + height > 100.000001 || image.naturalWidth * image.naturalHeight > 40_000_000) throw new Error("invalid-crop");
  const iw = rotation % 180 ? image.naturalHeight : image.naturalWidth;
  const ih = rotation % 180 ? image.naturalWidth : image.naturalHeight;
  const oriented = document.createElement("canvas");
  oriented.width = iw; oriented.height = ih;
  const source = oriented.getContext("2d");
  if (!source) throw new Error("image-render-failed");
  source.translate(flipHorizontal ? iw : 0, flipVertical ? ih : 0);
  source.scale(flipHorizontal ? -1 : 1, flipVertical ? -1 : 1);
  if (rotation === 90) source.translate(iw, 0);
  else if (rotation === 180) source.translate(iw, ih);
  else if (rotation === 270) source.translate(0, ih);
  source.rotate(rotation * Math.PI / 180);
  source.drawImage(image, 0, 0);
  const canvas = document.createElement("canvas");
  const left = Math.round(x / 100 * iw), top = Math.round(y / 100 * ih);
  canvas.width = Math.max(1, Math.min(iw - left, Math.round(width / 100 * iw)));
  canvas.height = Math.max(1, Math.min(ih - top, Math.round(height / 100 * ih)));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("image-render-failed");
  ctx.drawImage(oriented, left, top, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("image-encode-failed")), "image/png"));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("image-encode-failed"));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
