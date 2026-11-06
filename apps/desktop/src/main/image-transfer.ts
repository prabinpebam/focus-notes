import { IMAGE_BYTE_LIMIT, rasterInfo } from "./image-import.ts";
import { publicImageBytes } from "./image-metadata.ts";

export function imageClipboard(data: string, alt: string, caption: string) {
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(data);
  if (!match || match[2]!.length > Math.ceil(IMAGE_BYTE_LIMIT / 3) * 4 || alt.length > 65536 || caption.length > 65536) throw new Error("invalid-image");
  const bytes = Buffer.from(match[2]!, "base64");
  const info = rasterInfo(bytes);
  const clean = publicImageBytes(bytes, info.ext);
  const src = `data:image/${info.ext === "jpg" ? "jpeg" : info.ext};base64,${clean.toString("base64")}`;
  const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
  return { bytes: clean, text: [alt, caption].filter(Boolean).join("\n"), html: `<img src="${src}" alt="${escape(alt)}"${caption ? ` title="${escape(caption)}"` : ""}>` };
}
