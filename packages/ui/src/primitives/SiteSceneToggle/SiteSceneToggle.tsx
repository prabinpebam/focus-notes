import type { ReactNode } from "react";
import * as s from "./SiteSceneToggle.css.ts";

export interface SiteSceneToggleProps {
  name: string;
  label: string;
  lightLabel: string;
  darkLabel: string;
  light?: ReactNode;
  dark?: ReactNode;
}

/** A scene with a Light / Dark choice, by radio buttons and CSS alone: the site has no script (D-176). */
export function SiteSceneToggle({ name, label, lightLabel, darkLabel, light, dark }: SiteSceneToggleProps) {
  const id = `${name}-scheme`;
  return (
    <div className={s.root}>
      <div className={s.light}>{light}</div>
      <div className={s.dark}>{dark}</div>
      <fieldset className={s.group}>
        <legend className={s.legend}>{label}</legend>
        <input className={s.input} type="radio" name={id} id={`${id}-light`} value="light" defaultChecked />
        <label className={s.option} htmlFor={`${id}-light`}>{lightLabel}</label>
        <input className={[s.input, s.darkInput].join(" ")} type="radio" name={id} id={`${id}-dark`} value="dark" />
        <label className={s.option} htmlFor={`${id}-dark`}>{darkLabel}</label>
      </fieldset>
    </div>
  );
}