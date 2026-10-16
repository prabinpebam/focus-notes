import { SiteFigure } from "../SiteFigure/SiteFigure.tsx";
import * as s from "./SiteThemeShowcase.css.ts";

export interface SiteTheme {
  /** The theme's ID: its swatch takes its colours (data-theme-sample). */
  id: string;
  label: string;
  scheme: "light" | "dark";
  src: string;
  srcSet?: string;
  avifSet?: string;
  sizes?: string;
  alt: string;
  width?: number;
  height?: number;
}
export interface SiteThemeShowcaseProps {
  name: string;
  themes: readonly SiteTheme[];
  schemeLabel: string;
  lightLabel: string;
  darkLabel: string;
  lightThemesLabel: string;
  darkThemesLabel: string;
}

/** Every theme's screenshot, chosen by swatches and a Light / Dark switch, with radio buttons and CSS alone (D-176). */
export function SiteThemeShowcase({ name, themes, schemeLabel, lightLabel, darkLabel, lightThemesLabel, darkThemesLabel }: SiteThemeShowcaseProps) {
  const of = (scheme: "light" | "dark") => themes.filter((t) => t.scheme === scheme).slice(0, s.MAX);
  const pick = (scheme: "light" | "dark", i: number) => `${scheme[0]}${i}`;
  const id = (suffix: string) => `${name}-${suffix}`;
  const swatches = (scheme: "light" | "dark", label: string) => (
    <fieldset className={[s.group, s.swatches, scheme === "light" ? s.lightRow : s.darkRow].join(" ")}>
      <legend className={s.hidden} data-sr-only="">{label}</legend>
      {of(scheme).map((t, i) => (
        <span key={t.id} className={s.item}>
          <input className={s.input} type="radio" name={id(scheme)} id={id(t.id)} value={pick(scheme, i)} data-pick={pick(scheme, i)} defaultChecked={i === 0} />
          <label className={s.swatch} htmlFor={id(t.id)} data-theme-sample={t.id} title={t.label}>
            <span className={s.dot} aria-hidden="true" />
            <span className={s.hidden} data-sr-only="">{t.label}</span>
          </label>
        </span>
      ))}
    </fieldset>
  );
  return (
    <div className={s.root}>
      <div className={s.figures}>
        {(["light", "dark"] as const).flatMap((scheme) => of(scheme).map((t, i) => (
          <div key={t.id} className={s.figure} data-pick={pick(scheme, i)}>
            <SiteFigure src={t.src} {...(t.srcSet ? { srcSet: t.srcSet } : {})} {...(t.avifSet ? { avifSet: t.avifSet } : {})} {...(t.sizes ? { sizes: t.sizes } : {})} alt={t.alt} {...(t.width ? { width: t.width } : {})} {...(t.height ? { height: t.height } : {})} tone={scheme} />
          </div>
        )))}
      </div>
      <div className={s.controls}>
        <fieldset className={[s.group, s.toggle].join(" ")}>
          <legend className={s.hidden} data-sr-only="">{schemeLabel}</legend>
          <input className={[s.input, s.schemeLight].join(" ")} type="radio" name={id("scheme")} id={id("scheme-light")} value="light" defaultChecked />
          <label className={s.option} htmlFor={id("scheme-light")}>{lightLabel}</label>
          <input className={[s.input, s.schemeDark].join(" ")} type="radio" name={id("scheme")} id={id("scheme-dark")} value="dark" />
          <label className={s.option} htmlFor={id("scheme-dark")}>{darkLabel}</label>
        </fieldset>
        {swatches("light", lightThemesLabel)}
        {swatches("dark", darkThemesLabel)}
      </div>
    </div>
  );
}