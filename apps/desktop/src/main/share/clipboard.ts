/**
 * The clipboard for share secrets (WP-5.3, D-134, review L1): the main process writes a link, a
 * passcode, or an invite, and clears it after 90 seconds if the clipboard still holds exactly that
 * text, so a secret doesn't sit there for the next app to read. Electron's clipboard can't add
 * Windows' `ExcludeClipboardContentFromMonitorProcessing` or `CanIncludeInClipboardHistory` formats
 * beside text (each write replaces the clipboard), so Windows clipboard history and its cloud sync
 * may still keep a copy: the spec says so.
 */
export const SECRET_CLIPBOARD_MS = 90_000;

export interface TextClipboard { writeText(text: string): void; readText(): string; clear(): void }

export function secretClipboard(c: TextClipboard, o: { after?: (fn: () => void) => void; ms?: number } = {}) {
  const after = o.after ?? ((fn: () => void) => { setTimeout(fn, o.ms ?? SECRET_CLIPBOARD_MS).unref?.(); });
  return {
    write(text: string): void {
      c.writeText(text);
      after(() => { if (c.readText() === text) c.clear(); });
    },
  };
}
