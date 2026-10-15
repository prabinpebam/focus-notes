// The template for every app's generated entry document (Design system → Where HTML and CSS may
// exist). It holds only the root element and the Content Security Policy. Never add content here.
export const DEFAULT_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  // Trusted Types (SEC-02): HTML reaches the DOM only through the app's sanitizing default policy
  // and DOMPurify's own. No script has a policy; one script URL does: `search-worker` passes the
  // search index's own worker, from the app itself, and nothing else (D-107).
  "require-trusted-types-for 'script'",
  "trusted-types default dompurify search-worker",
].join("; ");

/**
 * `page: "reader"` makes a published page's document (IA-VIEW-PUBLIC): light or dark by the reader's
 * preference, the reader page's styles, kept out of search engines, and no referrer (the share reader, WP-5.4).
 * @param {{ title: string; script: string; csp?: string; lang?: string; icon?: string; page?: "reader" }} options
 * @returns {string}
 */
export function renderEntryHtml({ title, script, csp = DEFAULT_CSP, lang = "en", icon, page }) {
  const reader = page === "reader";
  return `<!doctype html>
<html lang="${lang}"${reader ? ` data-theme="auto" data-page="reader"` : ""}>
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light dark" />${reader ? `
    <meta name="robots" content="noindex, nofollow" />
    <meta name="referrer" content="no-referrer" />` : ""}
    <title>${title}</title>${icon ? `
    <link rel="icon" href="${icon}" type="image/svg+xml" />` : ""}
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="${script}"></script>
  </body>
</html>
`;
}
