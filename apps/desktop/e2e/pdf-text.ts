/**
 * Reads what Chromium's printToPDF wrote, page by page, for the print journey (SHR-12): the page
 * count, the document's title, and each page's text, through each font's ToUnicode map. Only what
 * Skia's PDFs use: plain objects (no object streams), Flate content, Type0 fonts with Identity-H.
 */
import { inflateSync } from "node:zlib";

interface Obj { dict: string; stream?: Buffer }

function objects(pdf: Buffer): Map<string, Obj> {
  const s = pdf.toString("latin1");
  const out = new Map<string, Obj>();
  for (const m of s.matchAll(/(\d+) 0 obj\s*([\s\S]*?)endobj/g)) {
    const body = m[2]!;
    const at = body.search(/stream\r?\n/);
    if (at < 0) { out.set(m[1]!, { dict: body }); continue; }
    const start = m.index! + m[0].indexOf(body) + at + /stream\r?\n/.exec(body.slice(at))![0].length;
    const end = s.indexOf("endstream", start);
    let stream = pdf.subarray(start, end);
    if (/\/FlateDecode/.test(body.slice(0, at))) stream = inflateSync(stream);
    out.set(m[1]!, { dict: body.slice(0, at), stream });
  }
  return out;
}

const hex = (h: string) => { const c: string[] = []; for (let i = 0; i < h.length; i += 4) c.push(h.slice(i, i + 4)); return c; };
const utf16 = (h: string) => String.fromCharCode(...hex(h).map((x) => parseInt(x, 16)));

function toUnicode(cmap: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const block of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))
    for (const m of block[1]!.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) map.set(m[1]!.toUpperCase().padStart(4, "0"), utf16(m[2]!));
  for (const block of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g))
    for (const m of block[1]!.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      const [a, b, d] = [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)];
      for (let g = a; g <= b; g++) map.set(g.toString(16).toUpperCase().padStart(4, "0"), String.fromCharCode(d + g - a));
    }
  return map;
}

export interface PdfText { title: string | undefined; pages: string[] }

/** Each page's text, a line per text object, in the order the pages are in. */
export function pdfText(pdf: Buffer): PdfText {
  const objs = objects(pdf);
  const ref = (dict: string, key: string) => new RegExp(`/${key}\\s+(\\d+) 0 R`).exec(dict)?.[1];
  const info = [...objs.values()].find((o) => /\/Producer/.test(o.dict));
  const rawTitle = info && /\/Title\s*(\((?:\\.|[^\\)])*\)|<[0-9A-Fa-f]*>)/.exec(info.dict)?.[1];
  const title = rawTitle === undefined ? undefined
    : rawTitle.startsWith("<") ? utf16(rawTitle.slice(1, -1).replace(/^FEFF/i, ""))
    : rawTitle.slice(1, -1).replace(/\\(.)/g, "$1");
  const tree = [...objs.values()].find((o) => /\/Type\s*\/Pages\b/.test(o.dict) && !/\/Parent/.test(o.dict));
  const kids = [...(/\/Kids\s*\[([^\]]*)\]/.exec(tree?.dict ?? "")?.[1] ?? "").matchAll(/(\d+) 0 R/g)].map((m) => m[1]!);
  const pages = kids.map((id) => {
    const page = objs.get(id)!.dict;
    const fonts = new Map<string, Map<string, string>>();
    for (const m of (/\/Font\s*<<([^>]*)>>/.exec(page)?.[1] ?? "").matchAll(/\/(\w+)\s+(\d+) 0 R/g)) {
      const cmap = ref(objs.get(m[2]!)?.dict ?? "", "ToUnicode");
      fonts.set(m[1]!, cmap ? toUnicode(objs.get(cmap)?.stream?.toString("latin1") ?? "") : new Map());
    }
    const content = objs.get(ref(page, "Contents") ?? "")?.stream?.toString("latin1") ?? "";
    let font = new Map<string, string>();
    const lines: string[] = [];
    let line = "";
    for (const t of content.matchAll(/\/(\w+)\s+[\d.]+\s+Tf|<([0-9A-Fa-f]*)>\s*Tj|\[([^\]]*)\]\s*TJ|\bBT\b|\bET\b/g)) {
      if (t[1]) font = fonts.get(t[1]) ?? new Map();
      else if (t[2] !== undefined) line += hex(t[2].toUpperCase()).map((g) => font.get(g) ?? "").join("");
      else if (t[3] !== undefined) for (const g of t[3].matchAll(/<([0-9A-Fa-f]*)>/g)) line += hex(g[1]!.toUpperCase()).map((x) => font.get(x) ?? "").join("");
      else if (t[0] === "ET" && line) (lines.push(line), (line = ""));
    }
    return lines.join("\n");
  });
  return { title, pages };
}
