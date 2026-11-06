import { useEffect, useRef, useState, type ReactNode, type CSSProperties, type PointerEvent, type KeyboardEvent } from "react";
import { IconButton } from "../IconButton/IconButton.tsx";
import { TextField } from "../TextField/TextField.tsx";
import { Text } from "../Text/Text.tsx";
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
  aspect?: "free" | "original" | "square" | "fourThree" | "wide";
  flipHorizontal?: boolean;
  flipVertical?: boolean;
  /** Names for all eight edges/corners and the invisible move target, from the message model. */
  handles: readonly { id: string; label: string }[];
  /** Exact source-pixel controls share the bottom toolbar with the view's icon actions. */
  widthLabel?: string;
  heightLabel?: string;
  lockLabel?: string;
  rangeMessage?: string;
  toolbarLabel?: string;
  /** A new reset signal restores the opening ratio-lock mode, including repeated preset choices. */
  resetSignal?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  children?: ReactNode;
  /** Draft-only changes; the primitive never writes an image or a note. */
  onChange?: (rect: CropRect) => void;
  /** The owning design view decides how a draft is committed. */
  onCommit?: () => void;
}

/**
 * Direct crop preview and its exact result; not an inline image menu or a photo editor.
 * @tier primitive
 * @a11y Native named buttons for handles; source remains described.
 * @key Arrow moves an edge or the crop by one source pixel; Shift+Arrow by ten.
 */
export function ImageCrop({ src, alt, intrinsicWidth, intrinsicHeight, editing = true, x = 0, y = 0, width: requestedWidth = 100, height: requestedHeight = 100, rotation = "0", aspect = "free", flipHorizontal = false, flipVertical = false, handles, widthLabel, heightLabel, lockLabel, rangeMessage, toolbarLabel, resetSignal, disabled = false, disabledReason, children, onChange, onCommit }: ImageCropProps) {
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{ handle: Handle; px: number; py: number; rect: CropRect } | undefined>(undefined);
  const [locked, setLocked] = useState(aspect !== "free");
  const [rangeError, setRangeError] = useState(false);
  const lockedRatio = useRef<number | undefined>(undefined);
  const lockContext = useRef({ aspect, resetSignal });
  const resetPending = lockContext.current.aspect !== aspect || lockContext.current.resetSignal !== resetSignal;
  useEffect(() => {
    lockContext.current = { aspect, resetSignal };
    setLocked(aspect !== "free"); lockedRatio.current = undefined; setRangeError(false);
  }, [aspect, resetSignal]);
  const quarter = rotation === "90" || rotation === "270";
  const iw = quarter ? intrinsicHeight : intrinsicWidth, ih = quarter ? intrinsicWidth : intrinsicHeight;
  const aspectValue = aspect === "original" ? iw / ih : aspect === "square" ? 1 : aspect === "fourThree" ? 4 / 3 : aspect === "wide" ? 16 / 9 : undefined;
  const effectiveAspect = !editing || resetPending ? aspectValue : locked ? lockedRatio.current ?? aspectValue : undefined;
  const factor = effectiveAspect === undefined ? undefined : effectiveAspect * ih / iw;
  const width = factor === undefined ? requestedWidth : Math.min(requestedWidth, requestedHeight * factor);
  const height = factor === undefined ? requestedHeight : width / factor;
  const rect = { x, y, width, height };
  useEffect(() => {
    if (editing && (Math.abs(width - requestedWidth) > 0.00001 || Math.abs(height - requestedHeight) > 0.00001)) {
      onChange?.({ x: x + (requestedWidth - width) / 2, y: y + (requestedHeight - height) / 2, width, height });
    }
  }, [editing, x, y, width, height, requestedWidth, requestedHeight, onChange]);
  const resizePixels = (axis: "width" | "height", value: string) => {
    const pixels = Number(value);
    if (!Number.isFinite(pixels) || value.trim() === "") { setRangeError(true); return; }
    const limit = axis === "width" ? iw : ih;
    const bounded = Math.max(1, Math.min(limit, Math.round(pixels)));
    let nextWidth = axis === "width" ? bounded / iw * 100 : width;
    let nextHeight = axis === "height" ? bounded / ih * 100 : height;
    if (factor !== undefined) {
      if (axis === "width") nextHeight = nextWidth / factor;
      else nextWidth = nextHeight * factor;
      const scale = Math.min(1, 100 / nextWidth, 100 / nextHeight);
      nextWidth *= scale; nextHeight *= scale;
    }
    setRangeError(bounded !== pixels || Math.abs((axis === "width" ? nextWidth * iw : nextHeight * ih) / 100 - pixels) > 0.5);
    onChange?.({ x: Math.min(x, 100 - nextWidth), y: Math.min(y, 100 - nextHeight), width: nextWidth, height: nextHeight });
  };
  const turn = rotation === "90" ? `translate(${iw} 0) rotate(90)` : rotation === "180" ? `translate(${iw} ${ih}) rotate(180)` : rotation === "270" ? `translate(0 ${ih}) rotate(270)` : "";
  const flip = `translate(${flipHorizontal ? iw : 0} ${flipVertical ? ih : 0}) scale(${flipHorizontal ? -1 : 1} ${flipVertical ? -1 : 1})`;
  const viewBox = editing ? `0 0 ${iw} ${ih}` : `${x * iw / 100} ${y * ih / 100} ${width * iw / 100} ${height * ih / 100}`;
  const variables = {
    [s.ratio.slice(4, -1)]: editing ? `${iw} / ${ih}` : `${width * iw} / ${height * ih}`,
    [s.ratioNumber.slice(4, -1)]: editing ? iw / ih : width * iw / (height * ih),
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
    if (factor !== undefined) {
      const horizontal = handle.includes("w") || handle.includes("e");
      const vertical = handle.includes("n") || handle.includes("s");
      const useWidth = horizontal && (!vertical || Math.abs(dx / start.width) >= Math.abs(dy / start.height));
      const anchorX = handle.includes("w") ? start.x + start.width : handle.includes("e") ? start.x : start.x + start.width / 2;
      const anchorY = handle.includes("n") ? start.y + start.height : handle.includes("s") ? start.y : start.y + start.height / 2;
      const maxWidth = horizontal ? handle.includes("w") ? anchorX : 100 - anchorX : 2 * Math.min(anchorX, 100 - anchorX);
      const maxHeight = vertical ? handle.includes("n") ? anchorY : 100 - anchorY : 2 * Math.min(anchorY, 100 - anchorY);
      const nextWidth = clamp(useWidth ? right - left : (bottom - top) * factor, Math.max(100 / iw, 100 / ih * factor), Math.min(maxWidth, maxHeight * factor));
      const nextHeight = nextWidth / factor;
      left = handle.includes("w") ? anchorX - nextWidth : handle.includes("e") ? anchorX : anchorX - nextWidth / 2;
      top = handle.includes("n") ? anchorY - nextHeight : handle.includes("s") ? anchorY : anchorY - nextHeight / 2;
      right = left + nextWidth;
      bottom = top + nextHeight;
    }
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
  return <div className={`${s.wrapper}${editing ? ` ${s.edit}` : ""}`} onKeyDown={event => {
    if (editing && event.key === "Enter" && !(event.target instanceof HTMLInputElement)) { event.preventDefault(); onCommit?.(); }
  }}>
    <div ref={stage} className={s.stage} style={variables}>
      <svg className={s.image} viewBox={viewBox} role="img" aria-label={alt}>
        <g transform={flip}><g transform={turn}><image href={src.startsWith("data:image/") ? src : undefined} width={intrinsicWidth} height={intrinsicHeight} /></g></g>
      </svg>
      {editing ? <>
        <div className={s.shade} aria-hidden="true"><div className={s.aperture} /></div>
        <div className={s.controlFrame}>
          <button type="button" disabled={disabled} className={s.move} aria-label={handles.find(handle => handle.id === "move")?.label} onPointerDown={e => pointerDown(e, "move")} onPointerMove={pointerMove}
            onPointerUp={() => { drag.current = undefined; }} onPointerCancel={() => { drag.current = undefined; }} onKeyDown={e => keyDown(e, "move")} />
          {handles.map(({ id, label }) => id !== "move" && id in s.handles ? <button key={id} type="button" disabled={disabled} aria-label={label} title={label} className={`${s.handle} ${s.handles[id as Handle]}`}
            onPointerDown={e => pointerDown(e, id as Handle)} onPointerMove={pointerMove}
            onPointerUp={() => { drag.current = undefined; }} onPointerCancel={() => { drag.current = undefined; }}
            onKeyDown={e => keyDown(e, id as Handle)} /> : null)}
        </div>
      </> : null}
    </div>
    {editing && widthLabel && heightLabel && lockLabel ? <div className={s.controls}>
      <div className={s.toolbar} role="group" aria-label={toolbarLabel}>
        <div className={s.actions}>{children}</div>
        <div className={s.dimensions}>
          <TextField label={widthLabel} prefix="W" labelHidden step={1} readOnly={disabled} value={String(Math.round(width * iw / 100))} width="number" size="m" onChange={({ value }) => resizePixels("width", value)} />
          <IconButton icon={locked ? "lock" : "unlock"} label={lockLabel} toggle pressed={locked} disabled={disabled} disabledReason={disabledReason} onPress={() => {
            lockedRatio.current = locked ? undefined : width * iw / (height * ih);
            setLocked(!locked);
          }} />
          <TextField label={heightLabel} prefix="H" labelHidden step={1} readOnly={disabled} value={String(Math.round(height * ih / 100))} width="number" size="m" onChange={({ value }) => resizePixels("height", value)} />
        </div>
      </div>
      {rangeError && rangeMessage ? <Text value={rangeMessage} tone="danger" role="caption" announce /> : null}
    </div> : null}
  </div>;
}
