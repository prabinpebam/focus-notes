import { randomUUID } from "node:crypto";
import { link, open, unlink } from "node:fs/promises";
import { join } from "node:path";

/** Publishes a complete copy without overwriting a collision, and remembers acknowledged copies for Retry. */
export function localImportCopies() {
  const receipts = new Map<string, { source: string; destination: string; result: Promise<string> }>();
  return function copy(request: string, source: string, destination: string, name: string, text: string): Promise<string> {
    const previous = receipts.get(request);
    if (previous) {
      if (previous.source !== source || previous.destination !== destination) throw new Error("changed");
      return previous.result;
    }
    const result = publish();
    receipts.set(request, { source, destination, result });
    void result.catch(() => { if (receipts.get(request)?.result === result) receipts.delete(request); });
    return result;

    async function publish(): Promise<string> {
      const staging = join(destination, `.focus-notes-import-${randomUUID()}.tmp`);
      let staged = false;
      try {
        const file = await open(staging, "wx");
        staged = true;
        try { await file.writeFile(text); }
        finally { await file.close(); }
        for (let i = 1; ; i++) {
          const target = join(destination, `${name}${i === 1 ? "" : ` ${i}`}.md`);
          try { await link(staging, target); return target; }
          catch (error) {
            if (!error || typeof error !== "object" || !("code" in error) || error.code !== "EEXIST") throw error;
          }
        }
      } finally {
        if (staged) {
          try { await unlink(staging); }
          catch { console.error("Could not remove a staged Local note copy."); }
        }
      }
    }
  };
}
