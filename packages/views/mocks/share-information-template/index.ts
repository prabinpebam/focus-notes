/**
 * Share information template mocks (strict design, not wired; G6.3 / SHR-19): Settings → Sharing's
 * Share information card, its editor with live validation and preview, and copy-time validation per
 * share. View documents over fake data; codes and links are fake. Spec: design/views/sharing.md.
 */
import data from "./data.json" with { type: "json" };
import template from "./template.view.json" with { type: "json" };

type Entry = { id: string; label: string; view: string; local?: Record<string, string | number | boolean> };

const t = data.templates;

/** The starting local state for a draft and a saved message: the same flags the view sets on each edit and Save. */
function state(draft: string, saved: string, extra: Record<string, string> = {}) {
  return {
    draft, saved,
    pName: draft.includes("{name}"), pPass: draft.includes("{passcode}"), pLink: draft.includes("{link}"),
    pCode: draft.includes("{site}") && draft.includes("{accessCode}"), isDefault: draft === t.default,
    savedLink: saved.includes("{link}"), savedCode: saved.includes("{site}") && saved.includes("{accessCode}"), savedDefault: saved === t.default,
    ...extra,
  };
}

export const shareInformationTemplateMocks = {
  id: "share-information-template",
  label: "Mocks: Share information template",
  models: { mockShareTemplate: data },
  views: { template },
  entries: [
    { id: "shareTemplate.settings", label: "1. Settings → Sharing: Share information (default)", view: "template", local: state(t.default, t.default) },
    { id: "shareTemplate.editor", label: "2. Edit: the default message and its preview", view: "template", local: state(t.default, t.default, { dialog: "edit" }) },
    { id: "shareTemplate.linkOnly", label: "3. Edit: preview for a link-only share (access code lines left out)", view: "template", local: state(t.default, t.default, { dialog: "edit", sample: "link" }) },
    { id: "shareTemplate.edited", label: "4. Edit: link line removed, still valid (site and access code)", view: "template", local: state(t.noLink, t.default, { dialog: "edit", sample: "code" }) },
    { id: "shareTemplate.name", label: "5. Edit: {name} added (error, draft kept, Save off)", view: "template", local: state(t.withName, t.default, { dialog: "edit" }) },
    { id: "shareTemplate.noMethod", label: "6. Edit: no link and no access code (error, draft kept)", view: "template", local: state(t.noMethod, t.default, { dialog: "edit" }) },
    { id: "shareTemplate.copyProblem", label: "7. Copy for a link-only share with a message that has no link (no Copied)", view: "template", local: state(t.noLink, t.noLink, { problemRow: "trip" }) },
    { id: "shareTemplate.copied", label: "8. Copied: the share information toast", view: "template", local: state(t.default, t.default, { status: "copied" }) },
  ] as Entry[],
};
