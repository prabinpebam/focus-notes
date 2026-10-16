/**
 * A fake disk that checks what a save expects, as the desktop shell does (DEF-26, D-92): a write
 * that expects other text than the file holds writes nothing and gets the text found; a batch's
 * link rewrite made from other text than the file holds is refused. Shared by the core tests, so
 * every save path they drive is held to the same rule.
 */
export function checkingDisk(files: Record<string, string>, onWrite?: (path: string, text: string) => void) {
  const differs = (path: string, expected: string | undefined, text: string) =>
    expected !== undefined && path in files && files[path] !== expected && files[path] !== text;
  return {
    writeNote: async (path: string, text: string, expected?: string): Promise<void | { outside: string }> => {
      if (differs(path, expected, text)) return { outside: files[path]! };
      files[path] = text;
      onWrite?.(path, text);
    },
    /** A batch's `write` op; throws the shell's refusal code when the file changed since it was read. */
    writeOp: (op: { path: string; text: string; before?: string }): void => {
      if (differs(op.path, op.before, op.text)) throw new Error("Refused: changed");
      files[op.path] = op.text;
      onWrite?.(op.path, op.text);
    },
  };
}
