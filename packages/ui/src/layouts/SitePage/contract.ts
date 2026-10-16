import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "SitePage",
  tier: "layout",
  description: "A page of the product site (IA-VIEW-SITE, IA-VIEW-HELP, WP-10.1): a skip link, a header with the site's navigation, the content as the page's main landmark, and a footer. It follows the visitor's light or dark preference and reads from 320 px wide.",
  props: {
    skipLabel: { kind: "message", required: true, description: "The skip link to the content." },
    navLabel: { kind: "message", required: true, description: "The site navigation's accessible name." },
    width: { kind: "enum", values: ["reading", "wide", "showcase"], default: "reading", description: "reading: the editor's measure, for articles; wide: a page of sections; showcase: the landing page, as wide as its screenshots (D-174)." },
  },
  events: {},
  slots: { default: { accepts: "any" }, header: { accepts: ["SiteLink"] }, footer: { accepts: "any", max: 1 } },
  states: ["rest"],
  tokens: "cmp.sitePage.*",
  a11y: { pattern: "landmarks", name: "banner with a labelled navigation, main, and contentinfo; the skip link is the first focusable element." },
  fixtures: [
    ...["reading", "wide", "showcase"].map((width) => ({
      name: `width ${width}`,
      props: { skipLabel: { t: "site.skip" }, navLabel: { t: "site.nav.label" }, width },
      slots: {
        header: [
          { type: "SiteLink", props: { label: { t: "site.brand" }, href: { get: "vm.gallery.href" }, variant: "brand" } },
          { type: "SiteLink", props: { label: { t: "site.nav.help" }, href: { get: "vm.gallery.href" }, variant: "nav", current: true } },
        ],
        footer: [{ type: "Text", props: { value: { t: "site.footer.note" }, role: "caption", tone: "muted" } }],
      },
      children: [{ type: "Text", props: { value: { t: "gallery.long" } } }],
    })),
  ],
});
