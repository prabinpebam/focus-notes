import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "ReaderPage",
  tier: "layout",
  description: "A published page (IA-VIEW-PUBLIC): a skip link, the reading column as the page's main landmark, and a quiet footer. It follows the reader's light or dark preference and reads from 320 px wide.",
  props: {
    skipLabel: { kind: "message", required: true, description: "The skip link to the note." },
    themeLabel: { kind: "message", description: "Enables the icon-only reader theme group and names it accessibly. Requires all three option labels." },
    lightLabel: { kind: "message", description: "Light radio's accessible name and native tooltip." },
    darkLabel: { kind: "message", description: "Dark radio's accessible name and native tooltip." },
    systemLabel: { kind: "message", description: "System radio's accessible name and native tooltip." },
  },
  events: {},
  slots: { default: { accepts: "any" }, footer: { accepts: "any", max: 1 } },
  states: ["rest"],
  tokens: "cmp.readerPage.*",
  a11y: { pattern: "landmarks", name: "main and contentinfo; the skip link is the first focusable element." },
  fixtures: [
    {
      name: "page",
      props: { skipLabel: { t: "reader.skip" }, themeLabel: { t: "site.preview.readerTheme" }, lightLabel: { t: "command.appearance.light" }, darkLabel: { t: "command.appearance.dark" }, systemLabel: { t: "command.appearance.system" } },
      children: [{ type: "Text", props: { value: { t: "gallery.long" } } }],
      slots: { footer: [{ type: "Text", props: { value: { t: "reader.footer" }, role: "caption", tone: "muted" } }] },
    },
  ],
});
