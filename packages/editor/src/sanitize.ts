/**
 * Sanitizing (SEC-02): pasted HTML goes through an allow-list before anything parses it, links
 * keep only safe schemes, and the app runs under Trusted Types with one `default` policy that
 * sanitizes any HTML a library hands to the DOM. DOMPurify (Apache-2.0 or MPL-2.0) does the work.
 */
import DOMPurify, { type Config, type UponSanitizeAttributeHookEvent } from "dompurify";

/** Relative addresses, and http, https, and mailto (Security and privacy → Threats and controls). */
const SAFE_URI = /^(?:(?:https?|mailto):|[^a-z]|[a-z0-9+.-]+(?:[^a-z0-9+.\-:]|$))/i;
/** Characters browsers ignore inside a URL scheme, which `java\tscript:` hides behind. */
const URI_NOISE = /[\u0000-\u0020\u00a0\u1680\u180e\u2000-\u2029\u205f\u3000]/g;

/** A link address the app may render and keep from a paste: relative, http, https, or mailto. */
export const isSafeHref = (href: string): boolean => SAFE_URI.test(href.replace(URI_NOISE, ""));

/** The tags a paste can carry. Everything else is dropped, keeping its text. */
const PASTE_TAGS = [
  "p", "div", "span", "br", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote", "pre", "code",
  "kbd", "samp", "tt", "b", "strong", "i", "em", "s", "del", "strike", "u", "ins", "sub", "sup", "mark", "small",
  "a", "hr", "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "img", "input", "label",
  "section", "article", "header", "footer", "main", "aside", "nav", "figure", "figcaption", "dl", "dt", "dd",
  "address", "center", "font", "abbr", "cite", "q", "time",
];
/** Attributes the conversion reads. `style` keeps only the declarations listed in STYLE_KEPT. */
const PASTE_ATTRS = ["href", "title", "alt", "start", "type", "checked", "class", "style", "dir", "lang"];
/** Bold, italic, strikethrough, and Word's list markers: all the conversion needs from styles. */
const STYLE_KEPT = /^(font-weight|font-style|text-decoration(-line)?|mso-list)$/i;

const PASTE_CONFIG: Config = {
  ALLOWED_TAGS: PASTE_TAGS,
  ALLOWED_ATTR: PASTE_ATTRS,
  // ProseMirror's own copies (data-pm-slice, data-type, data-checked) keep their structure.
  ALLOW_DATA_ATTR: true,
  ALLOW_ARIA_ATTR: false,
  ALLOWED_URI_REGEXP: SAFE_URI,
  FORBID_TAGS: ["style", "script", "template", "noscript", "iframe", "object", "embed", "svg", "math", "form", "button", "select", "textarea"],
};

const keepStyle = (_node: Element, data: UponSanitizeAttributeHookEvent) => {
  if (data.attrName === "class") {
    // Only a code block's language survives.
    data.attrValue = data.attrValue.split(/\s+/).filter((c) => /^(language|lang)-[\w+#.-]+$/.test(c)).join(" ");
    if (!data.attrValue) data.keepAttr = false;
    return;
  }
  if (data.attrName === "href") {
    if (!isSafeHref(data.attrValue)) data.keepAttr = false;
    return;
  }
  if (data.attrName !== "style") return;
  data.attrValue = data.attrValue
    .split(";")
    .map((d) => d.trim())
    .filter((d) => {
      const [name, value = ""] = d.split(":");
      return STYLE_KEPT.test((name ?? "").trim()) && !/[()\\]/.test(value);
    })
    .join(";");
  if (!data.attrValue) data.keepAttr = false;
};

/**
 * Pasted HTML, cleaned to what the conversion understands: no scripts, event handlers, styles
 * beyond bold, italic, strikethrough, and Word lists, images without a source, and links only
 * with safe schemes. The result is still only parsed in an inert document.
 */
export function sanitizePastedHtml(html: string): string {
  DOMPurify.addHook("uponSanitizeAttribute", keepStyle);
  try {
    return DOMPurify.sanitize(html, { ...PASTE_CONFIG, RETURN_TRUSTED_TYPE: false }) as string;
  } finally {
    DOMPurify.removeHook("uponSanitizeAttribute", keepStyle);
  }
}

/** The only policy names the Content Security Policy allows (`trusted-types default dompurify`). */
export const TRUSTED_TYPES_POLICIES = ["default", "dompurify"] as const;

interface TrustedTypesFactory {
  createPolicy(name: string, rules: { createHTML?: (s: string) => string }): unknown;
  defaultPolicy?: unknown;
}

let installed = false;
/**
 * Installs the `default` Trusted Types policy (SEC-02). The app writes no HTML itself; libraries
 * do in a few places (a live region clearing itself, the Markdown parser decoding `&copy;`,
 * ProseMirror reading the clipboard). Text without markup passes as it is, and anything with
 * markup is sanitized. Scripts and script URLs have no policy, so they're always refused.
 */
export function installTrustedTypes(win: { trustedTypes?: TrustedTypesFactory } = globalThis as never): void {
  const tt = win.trustedTypes;
  if (installed || !tt || tt.defaultPolicy) return;
  installed = true;
  let depth = 0;
  tt.createPolicy("default", {
    createHTML: (s: string) => {
      if (!s.includes("<")) return s;
      // A sanitizer that itself reached a sink would loop; refuse rather than pass it through.
      if (depth > 0) return "";
      depth++;
      try {
        return DOMPurify.sanitize(s, { RETURN_TRUSTED_TYPE: false, ALLOWED_URI_REGEXP: SAFE_URI }) as string;
      } finally {
        depth--;
      }
    },
  });
}
