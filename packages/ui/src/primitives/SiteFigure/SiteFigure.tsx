import * as s from "./SiteFigure.css.ts";

export interface SiteFigureProps {
  src: string;
  srcSet?: string;
  avifSet?: string;
  darkSrcSet?: string;
  darkAvifSet?: string;
  sizes?: string;
  alt: string;
  width?: number;
  height?: number;
  priority?: boolean;
}

const DARK = "(prefers-color-scheme: dark)";

/** A desktop scene, AVIF or WebP, light or dark by the visitor's setting, sized before it loads (D-176, PRF-12). */
export function SiteFigure({ src, srcSet, avifSet, darkSrcSet, darkAvifSet, sizes, alt, width, height, priority }: SiteFigureProps) {
  return (
    <picture className={s.root}>
      {darkAvifSet ? <source type="image/avif" srcSet={darkAvifSet} sizes={sizes} media={DARK} /> : null}
      {darkSrcSet ? <source type="image/webp" srcSet={darkSrcSet} sizes={sizes} media={DARK} /> : null}
      {avifSet ? <source type="image/avif" srcSet={avifSet} sizes={sizes} /> : null}
      {srcSet ? <source type="image/webp" srcSet={srcSet} sizes={sizes} /> : null}
      <img className={s.image} src={src} alt={alt} width={width} height={height} decoding="async" loading={priority ? "eager" : "lazy"} {...(priority ? { fetchPriority: "high" as const } : {})} />
    </picture>
  );
}