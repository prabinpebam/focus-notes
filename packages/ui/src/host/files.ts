/**
 * Saving and choosing files in the browser (PKG-11). DOM elements may only be made in packages/ui
 * (the boundary check), so the web shell asks here for the download link and the file chooser.
 */

/** Saves text as a file through the browser's own download. */
export function saveTextFile(name: string, text: string, type = "application/json"): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Asks for one file and resolves to its text, or undefined if the person cancels. Bigger files are refused unread. */
export function openTextFile(accept: string, maxBytes = 64 * 1024 * 1024): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.hidden = true;
    let settled = false;
    const done = (v: string | undefined) => { if (!settled) { settled = true; input.remove(); resolve(v); } };
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) return done(undefined);
      if (file.size > maxBytes) { settled = true; input.remove(); return reject(new Error("too large")); }
      file.text().then(done, (e) => { settled = true; input.remove(); reject(e); });
    });
    input.addEventListener("cancel", () => done(undefined));
    document.body.append(input);
    input.click();
  });
}
