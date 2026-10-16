import * as s from "./SiteFigure.css.ts";

export interface SiteFigureProps {
  src: string;
  srcDark?: string;
  alt: string;
  width?: number;
  height?: number;
  priority?: boolean;
}

/** A screenshot, light or dark by the visitor's setting, sized before it loads (D-174, PRF-12). */
export function SiteFigure({ src, srcDark, alt, width, height, priority }: SiteFigureProps) {
  const img = <img className={s.image} src={src} alt={alt} width={width} height={height} decoding="async" loading={priority ? "eager" : "lazy"} {...(priority ? { fetchPriority: "high" as const } : {})} />;
  return (
    <picture className={s.root}>
      {srcDark ? <source srcSet={srcDark} media="(prefers-color-scheme: dark)" /> : null}
      {img}
    </picture>
  );
}