/**
 * Reads what Chromium's printToPDF wrote, page by page, for the print journey (SHR-12): the page
 * count, the document's title, and each page's text, through each font's ToUnicode map. Only what
 * Skia's PDFs use: plain objects (no object streams), Flate content, Type0 and Type3 fonts.
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

/** Raster image placements in Chromium's PDF, in points from the page's top-left. */
export function pdfImages(pdf: Buffer): { page: number; width: number; height: number; x: number; y: number; drawnWidth: number; drawnHeight: number; pageWidth: number; pageHeight: number }[] {
  const objs = objects(pdf);
  const pages = [...objs.values()].filter(object => /\/Type\s*\/Page\b/.test(object.dict));
  type Matrix = [number, number, number, number, number, number];
  const multiply = (a: Matrix, b: Matrix): Matrix => [
    a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
  ];
  return pages.flatMap((page, index) => {
    const media = /\/MediaBox\s*\[([\d.\s]+)\]/.exec(page.dict)?.[1]?.trim().split(/\s+/).map(Number) ?? [];
    const refs = new Map([...(/\/XObject\s*<<([\s\S]*?)>>/.exec(page.dict)?.[1] ?? "").matchAll(/\/(\w+)\s+(\d+) 0 R/g)].map(match => [match[1]!, match[2]!]));
    const contents = /\/Contents\s+(\d+) 0 R/.exec(page.dict)?.[1];
    const stream = objs.get(contents ?? "")?.stream?.toString("latin1") ?? "";
    const placed = [];
    let matrix: Matrix = [1, 0, 0, 1, 0, 0];
    const stack: Matrix[] = [];
    const number = "-?(?:\\d*\\.\\d+|\\d+)";
    const operations = new RegExp(`(${number})\\s+(${number})\\s+(${number})\\s+(${number})\\s+(${number})\\s+(${number})\\s+cm|\\/(\\w+)\\s+Do|\\b(q|Q)\\b`, "g");
    for (const operation of stream.matchAll(operations)) {
      if (operation[8] === "q") stack.push(matrix);
      else if (operation[8] === "Q") matrix = stack.pop() ?? [1, 0, 0, 1, 0, 0];
      else if (operation[1] !== undefined) matrix = multiply(matrix, [Number(operation[1]), Number(operation[2]), Number(operation[3]), Number(operation[4]), Number(operation[5]), Number(operation[6])]);
      else {
        const image = objs.get(refs.get(operation[7] ?? "") ?? "")?.dict;
        if (!image || !/\/Subtype\s*\/Image\b/.test(image)) continue;
        const width = Number(/\/Width\s+(\d+)/.exec(image)?.[1]);
        const height = Number(/\/Height\s+(\d+)/.exec(image)?.[1]);
        placed.push({
          page: index + 1, width, height,
          x: Math.min(matrix[4], matrix[4] + matrix[0]),
          y: (media[3] ?? 0) - Math.max(matrix[5], matrix[5] + matrix[3]),
          drawnWidth: Math.abs(matrix[0]), drawnHeight: Math.abs(matrix[3]),
          pageWidth: (media[2] ?? 0) - (media[0] ?? 0), pageHeight: (media[3] ?? 0) - (media[1] ?? 0),
        });
      }
    }
    return placed;
  });
}

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
    const fonts = new Map<string, { unicode: Map<string, string>; codeWidth: number }>();
    for (const m of (/\/Font\s*<<([^>]*)>>/.exec(page)?.[1] ?? "").matchAll(/\/(\w+)\s+(\d+) 0 R/g)) {
      const dictionary = objs.get(m[2]!)?.dict ?? "";
      const cmap = ref(dictionary, "ToUnicode");
      fonts.set(m[1]!, { unicode: cmap ? toUnicode(objs.get(cmap)?.stream?.toString("latin1") ?? "") : new Map(), codeWidth: /\/Subtype\s*\/Type3\b/.test(dictionary) ? 2 : 4 });
    }
    const content = objs.get(ref(page, "Contents") ?? "")?.stream?.toString("latin1") ?? "";
    let font = new Map<string, string>();
    let codeWidth = 4;
    const decode = (encoded: string) => {
      let text = "";
      for (let i = 0; i < encoded.length; i += codeWidth) text += font.get(encoded.slice(i, i + codeWidth).toUpperCase().padStart(4, "0")) ?? "";
      return text;
    };
    const lines: string[] = [];
    let line = "";
    for (const t of content.matchAll(/\/(\w+)\s+[\d.]+\s+Tf|<([0-9A-Fa-f]*)>\s*Tj|\[([^\]]*)\]\s*TJ|\bBT\b|\bET\b/g)) {
      if (t[1]) { const selected = fonts.get(t[1]); font = selected?.unicode ?? new Map(); codeWidth = selected?.codeWidth ?? 4; }
      else if (t[2] !== undefined) line += decode(t[2]);
      else if (t[3] !== undefined) for (const g of t[3].matchAll(/<([0-9A-Fa-f]*)>/g)) line += decode(g[1]!);
      else if (t[0] === "ET" && line) (lines.push(line), (line = ""));
    }
    return lines.join("\n");
  });
  return { title, pages };
}
