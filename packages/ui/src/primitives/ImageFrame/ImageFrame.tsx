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
  /** An author-only line under the image. */
  hint?: string;
  /** Edit image: the crop frame over the preview. */
  crop?: boolean;
  rotation?: keyof typeof s.rotation;
}

/** An inline image: shown, never stretched or cropped by its frame (IMG, D-300). */
export function ImageFrame({ src, alt, mode = "column", fitHeight = true, rounded = false, selected = false, hint, crop = false, rotation = "0" }: ImageFrameProps) {
  const safe = src.startsWith("data:image/") ? src : undefined;
  return (
    <span className={`${s.frame} ${s.mode[mode]}`} data-image-mode={mode}>
      <span className={`${s.box}${selected ? ` ${s.selected}` : ""}${rounded ? ` ${s.rounded}` : ""}`} data-selected={selected ? "" : undefined}>
        {safe ? <img className={`${s.img} ${fitHeight && mode !== "thumb" ? s.fit : ""} ${s.rotation[rotation]}`} src={safe} alt={alt ?? ""} draggable={false} /> : null}
        {crop ? (
          <span className={s.crop} aria-hidden="true">
            {(["tl", "tr", "bl", "br"] as const).map((c) => <span key={c} className={`${s.handle} ${s.corner[c]}`} />)}
          </span>
        ) : null}
      </span>
      {hint ? <span className={s.hint}>{hint}</span> : null}
    </span>
  );
}
