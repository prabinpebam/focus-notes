import * as s from "./SiteLink.css.ts";

export interface SiteLinkProps {
  label: string;
  href: string;
  variant?: keyof typeof s.variant;
  current?: boolean;
  id?: string;
}

/** A link on the product site (WP-10.1). Links to other sites never send a referrer (PRV-01). */
export function SiteLink({ label, href, variant = "inline", current, id }: SiteLinkProps) {
  const external = /^https?:/i.test(href);
  return (
    <a id={id} className={[s.base, s.variant[variant]].join(" ")} href={href} aria-current={current ? "page" : undefined} {...(external ? { rel: "noreferrer" } : {})}>
      {label}
    </a>
  );
}
