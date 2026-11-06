import { useRef, type CSSProperties, type PointerEvent, type KeyboardEvent } from "react";
import * as s from "./ImageCrop.css.ts";

type Handle = keyof typeof s.handles;
export interface CropRect { x: number; y: number; width: number; height: number }
export interface ImageCropProps {
  /** Passive data URL only; no network fetches. */
  src: string;
  /** Description of the image content, not crop instructions. */
  alt: string;
  /** Decoded source dimensions, before quarter-turn rotation. */
  intrinsicWidth: number;
  intrinsicHeight: number;
  /** True for an editing stage, false for the exact cropped result. */
  editing?: boolean;
  /** Crop rectangle as percentages of the oriented source. */
  x?: number; y?: number; width?: number; height?: number;
  rotation?: "0" | "90" | "180" | "270";
  flipHorizontal?: boolean;
  flipVertical?: boolean;
  /** Names for all eight edges/corners and the move target, from the message model. */
  handles: readonly { id: string; label: string }[];
  /** Draft-only changes; the primitive never writes an image or a note. */
  onChange?: (rect: CropRect) => void;
}

/**
 * Direct crop preview and its exact result; not an inline image menu or a photo editor.
 * @tier primitive
 * @a11y Native named buttons for handles; source remains described.
 * @key Arrow moves an edge or the crop by one source pixel; Shift+Arrow by ten.
 */
export function ImageCrop({ src, alt, intrinsicWidth, intrinsicHeight, editing = true, x = 0, y = 0, width = 100, height = 100, rotation = "0", flipHorizontal = false, flipVertical = false, handles, onChange }: ImageCropProps) {
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{ handle: Handle; px: number; py: number; rect: CropRect } | undefined>(undefined);
  const quarter = rotation === "90" || rotation === "270";
  const iw = quarter ? intrinsicHeight : intrinsicWidth, ih = quarter ? intrinsicWidth : intrinsicHeight;
  const rect = { x, y, width, height };
  const turn = rotation === "90" ? `translate(${iw} 0) rotate(90)` : rotation === "180" ? `translate(${iw} ${ih}) rotate(180)` : rotation === "270" ? `translate(0 ${ih}) rotate(270)` : "";
  const flip = `translate(${flipHorizontal ? iw : 0} ${flipVertical ? ih : 0}) scale(${flipHorizontal ? -1 : 1} ${flipVertical ? -1 : 1})`;
  const viewBox = editing ? `0 0 ${iw} ${ih}` : `${x * iw / 100} ${y * ih / 100} ${width * iw / 100} ${height * ih / 100}`;
  const variables = {
    [s.ratio.slice(4, -1)]: editing ? `${iw} / ${ih}` : `${width * iw} / ${height * ih}`,
    [s.x.slice(4, -1)]: `${x}%`, [s.y.slice(4, -1)]: `${y}%`,
    [s.width.slice(4, -1)]: `${width}%`, [s.height.slice(4, -1)]: `${height}%`,
  } as CSSProperties;
  const change = (handle: Handle, dx: number, dy: number, start: CropRect) => {
    const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
    if (handle === "move") return onChange?.({ ...start, x: clamp(start.x + dx, 0, 100 - start.width), y: clamp(start.y + dy, 0, 100 - start.height) });
    let left = start.x, top = start.y, right = left + start.width, bottom = top + start.height;
    if (handle.includes("w")) left = clamp(left + dx, 0, right - 100 / iw);
    if (handle.includes("e")) right = clamp(right + dx, left + 100 / iw, 100);
    if (handle.includes("n")) top = clamp(top + dy, 0, bottom - 100 / ih);
    if (handle.includes("s")) bottom = clamp(bottom + dy, top + 100 / ih, 100);
    onChange?.({ x: left, y: top, width: right - left, height: bottom - top });
  };
  const pointerDown = (e: PointerEvent<HTMLButtonElement>, handle: Handle) => {
    e.preventDefault();
    e.currentTarget.focus();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { handle, px: e.clientX, py: e.clientY, rect };
  };
  const pointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    const start = drag.current, box = stage.current?.getBoundingClientRect();
    if (start && box) change(start.handle, (e.clientX - start.px) / box.width * 100, (e.clientY - start.py) / box.height * 100, start.rect);
  };
  const keyDown = (e: KeyboardEvent<HTMLButtonElement>, handle: Handle) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
    e.preventDefault();
    const pixels = e.shiftKey ? 10 : 1;
    change(handle, (e.key === "ArrowLeft" ? -pixels : e.key === "ArrowRight" ? pixels : 0) / iw * 100, (e.key === "ArrowUp" ? -pixels : e.key === "ArrowDown" ? pixels : 0) / ih * 100, rect);
  };
  return <div className={`${s.wrapper}${editing ? ` ${s.edit}` : ""}`}>
    <div ref={stage} className={s.stage} style={variables}>
      <svg className={s.image} viewBox={viewBox} role="img" aria-label={alt}>
        <g transform={flip}><g transform={turn}><image href={src.startsWith("data:image/") ? src : undefined} width={intrinsicWidth} height={intrinsicHeight} /></g></g>
      </svg>
      {editing ? <>
        <div className={s.shade} aria-hidden="true"><div className={s.aperture} /></div>
        <div className={s.controlFrame}>
          {handles.map(({ id, label }) => id in s.handles ? <button key={id} type="button" aria-label={label} title={label} className={`${s.handle} ${s.handles[id as Handle]}`}
            onPointerDown={e => pointerDown(e, id as Handle)} onPointerMove={pointerMove}
            onPointerUp={() => { drag.current = undefined; }} onPointerCancel={() => { drag.current = undefined; }}
            onKeyDown={e => keyDown(e, id as Handle)} /> : null)}
        </div>
      </> : null}
    </div>
  </div>;
}
