/** Relative addresses and http, https and mailto; strip characters browsers ignore in schemes. */
export const isSafeHref = (href: string): boolean => /^(?:(?:https?|mailto):|[^a-z]|[a-z0-9+.-]+(?:[^a-z0-9+.\-:]|$))/i.test(
  href.replace(/[\u0000-\u0020\u00a0\u1680\u180e\u2000-\u2029\u205f\u3000]/g, ""),
);
