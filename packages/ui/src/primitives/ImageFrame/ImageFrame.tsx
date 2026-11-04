import type { CSSProperties, MouseEvent, KeyboardEvent } from "react";
import { Icon } from "../Icon/Icon.tsx";
import { Button } from "../Button/Button.tsx";
import * as s from "./ImageFrame.css.ts";

export interface ImageFrameProps {
  /** A data URL the shell made from the managed asset, never an address. */
  src: string;
  /** The image description; without one the image is decorative. */
  alt?: string;
  mode?: keyof typeof s.mode;
  /** Fit height (D-300), on by default. */
  fitHeight?: boolean;
  rounded?: boolean;
  selected?: boolean;
  /** Explicit visual state supplied by the image reader; never inferred as an empty image. */
  broken?: boolean;
  error?: string;
  retryLabel?: string;
  onRetry?: () => void;
  /** Edit image: the crop frame over the preview. */
  crop?: boolean;
  rotation?: keyof typeof s.rotation;
  cropX?: number;
  cropY?: number;
  cropWidth?: number;
  cropHeight?: number;
  onSize?: (p: { width: number; height: number }) => void;
  /** The image menu: right-click, or the context-menu key or Shift+F10 while it's selected (owner, 3 November). */
  onContextMenu?: (p: { x: number; y: number }) => void;
}

/** An inline image: shown as it is, never stretched, cropped, framed or backed by its frame (IMG, D-300). */
export function ImageFrame({ src, alt, mode = "column", fitHeight = true, rounded = false, selected = false, broken = false, error, retryLabel, onRetry, crop = false, rotation = "0", cropX, cropY, cropWidth, cropHeight, onSize, onContextMenu }: ImageFrameProps) {
  const safe = src.startsWith("data:image/") ? src : undefined;
  const menu = onContextMenu ? {
    onContextMenu: (e: MouseEvent) => { e.preventDefault(); onContextMenu({ x: e.clientX, y: e.clientY }); },
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) {
        e.preventDefault();
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        onContextMenu({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
      }
    },
    tabIndex: selected ? 0 : -1,
  } : {};
  return (
    <span className={`${s.frame} ${s.mode[mode]}`} data-image-mode={mode}>
      <span className={`${s.box}${selected ? ` ${s.selected}` : ""}${rounded ? ` ${s.rounded}` : ""}`} data-selected={selected ? "" : undefined} {...menu}>
        {broken ? <span className={s.broken} role="group" aria-label={alt}>
          <Icon name="image" />
          {alt ? <span>{alt}</span> : null}
          {error ? <span role="status">{error}</span> : null}
          {retryLabel ? <Button label={retryLabel} size="s" {...(onRetry ? { onPress: onRetry } : {})} /> : null}
        </span> : safe ? <img className={`${s.img} ${fitHeight && mode !== "thumb" ? s.fit : ""} ${s.rotation[rotation]}`} src={safe} alt={alt ?? ""} draggable={false} onLoad={(e) => onSize?.({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })} /> : null}
        {crop ? (
          <span className={`${s.crop}${cropWidth === undefined ? "" : ` ${s.cropCustom}`}`} style={cropWidth === undefined ? undefined : { [s.cropX.slice(4, -1)]: `${cropX ?? 0}%`, [s.cropY.slice(4, -1)]: `${cropY ?? 0}%`, [s.cropWidth.slice(4, -1)]: `${cropWidth}%`, [s.cropHeight.slice(4, -1)]: `${cropHeight ?? 100}%` } as CSSProperties} aria-hidden="true">
            {(["tl", "tr", "bl", "br"] as const).map((c) => <span key={c} className={`${s.handle} ${s.corner[c]}`} />)}
          </span>
        ) : null}
      </span>
    </span>
  );
}
