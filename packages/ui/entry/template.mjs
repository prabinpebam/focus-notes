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
  // and DOMPurify's own; scripts and script URLs have no policy at all.
  "require-trusted-types-for 'script'",
  "trusted-types default dompurify",
].join("; ");

/**
 * @param {{ title: string; script: string; csp?: string; lang?: string; icon?: string }} options
 * @returns {string}
 */
export function renderEntryHtml({ title, script, csp = DEFAULT_CSP, lang = "en", icon }) {
  return `<!doctype html>
<html lang="${lang}">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light dark" />
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
