import { Children, type ReactNode } from "react";
import * as s from "./IconLayout.css.ts";

export interface IconLayoutProps {
  icon?: ReactNode;
  heading?: ReactNode;
  actions?: ReactNode;
  id?: string;
  children?: ReactNode;
}

/** Dialogs, alert cards and popover cards (D-408): icon column, content column, trailing actions with the primary last. */
export function IconLayout({ icon, heading, actions, id, children }: IconLayoutProps) {
  const head = Children.toArray(heading);
  const body = Children.toArray(children);
  const acts = Children.toArray(actions);
  return (
    <div id={id} className={s.base} data-icon-layout="">
      {Children.count(icon) ? <div className={s.icon} data-icon-layout-icon="">{icon}</div> : null}
      <div className={s.content} data-icon-layout-content="">
        {head.length || body.length ? (
          <div className={s.main}>
            {head.length ? <div className={s.header} data-icon-layout-heading="">{head}</div> : null}
            {body}
          </div>
        ) : null}
        {acts.length ? <div className={s.actions} data-icon-layout-actions="">{acts}</div> : null}
      </div>
    </div>
  );
}
