import { Extension, type CommandProps, type Editor } from "@tiptap/core";
import { Plugin, PluginKey, type Selection } from "@tiptap/pm/state";
import { closeHistory } from "@tiptap/pm/history";
import type { Node as PMNode, ResolvedPos } from "@tiptap/pm/model";

export interface ImageImportRequest { request: string; files?: File[]; error?: string }
export interface ImageAsset { src: string; width: number; height: number }
interface Target extends ImageImportRequest { pos: number; invalid: boolean; cut?: string; replace?: string; caption?: string; original?: PMNode }
const key = new PluginKey<ReadonlyMap<string, Target>>("imageInsertion");
let sequence = 0;
const allowedAt = (pos: ResolvedPos) => !pos.parent.type.spec.code
  && !Array.from({ length: pos.depth }, (_, i) => pos.node(i + 1).type.name).includes("table");
const allowed = (selection: Selection) => allowedAt(selection.$from);
const imageFile = (file: File) => file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|svg|heic|avif|bmp|tiff?)$/i.test(file.name);

export function requestImageCommand({ tr, dispatch }: CommandProps, files?: File[], pos = tr.selection.to): boolean {
  if (!allowedAt(tr.doc.resolve(pos))) return false;
  if (dispatch) tr.setMeta(key, { add: { request: `image-${++sequence}`, pos, files, invalid: false } satisfies Target });
  return true;
}

export function cancelImageImport(editor: Editor, request: string): void {
  if (!editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(key, { remove: request }).setMeta("addToHistory", false));
}

function trackImageTarget(editor: Editor, request: string, pos: number, src: string, operation: "cut" | "replace" | "caption"): void {
  const node = Number.isInteger(pos) && pos >= 0 && pos < editor.state.doc.content.size ? editor.state.doc.nodeAt(pos) : undefined;
  if (editor.isEditable && node?.type.name === "image" && node.attrs.src === src) {
    editor.view.dispatch(editor.state.tr.setMeta(key, { add: { request, pos, invalid: false, [operation]: src, ...(operation === "caption" ? { original: node } : {}) } satisfies Target }).setMeta("addToHistory", false));
  }
}

export function trackImageCut(editor: Editor, request: string, pos: number, src: string): void {
  trackImageTarget(editor, request, pos, src, "cut");
}

export function trackImageReplacement(editor: Editor, request: string, pos: number, src: string): void {
  trackImageTarget(editor, request, pos, src, "replace");
}

export function trackImageCaption(editor: Editor, request: string, pos: number, src: string): void {
  trackImageTarget(editor, request, pos, src, "caption");
}

export function applyImageCaption(editor: Editor, request: string, title: string): boolean {
  const target = key.getState(editor.state)?.get(request);
  const node = target && editor.state.doc.nodeAt(target.pos);
  if (!target || target.invalid || !editor.isEditable || node !== target.original || node?.type.name !== "image" || node.attrs.src !== target.caption) return false;
  editor.view.dispatch(closeHistory(editor.state.tr).setNodeMarkup(target.pos, undefined, { ...node.attrs, title: title || null }).setMeta(key, { remove: request }));
  editor.view.dispatch(closeHistory(editor.state.tr));
  return true;
}

export function finishImageCut(editor: Editor, request: string): boolean {
  const target = key.getState(editor.state)?.get(request);
  const node = target && editor.state.doc.nodeAt(target.pos);
  if (!target || target.invalid || !editor.isEditable || node?.type.name !== "image" || node.attrs.src !== target.cut) {
    cancelImageImport(editor, request);
    return false;
  }
  const tr = closeHistory(editor.state.tr).delete(target.pos, target.pos + node.nodeSize).setMeta(key, { remove: request });
  editor.view.dispatch(tr);
  editor.view.dispatch(closeHistory(editor.state.tr));
  return true;
}

export function insertImageAssets(editor: Editor, request: string, images: readonly ImageAsset[]): boolean {
  const target = key.getState(editor.state)?.get(request);
  if (!target || target.invalid || !editor.isEditable || !images.length || !allowedAt(editor.state.doc.resolve(target.pos))) {
    cancelImageImport(editor, request);
    return false;
  }
  if (target.replace) {
    const node = editor.state.doc.nodeAt(target.pos);
    if (images.length !== 1 || node?.type.name !== "image" || node.attrs.src !== target.replace) {
      cancelImageImport(editor, request);
      return false;
    }
    editor.view.dispatch(closeHistory(editor.state.tr).setNodeMarkup(target.pos, undefined, { ...node.attrs, ...images[0] }).setMeta(key, { remove: request }));
    editor.view.dispatch(closeHistory(editor.state.tr));
    return true;
  }
  return editor.chain().command(({ tr }) => {
    closeHistory(tr);
    tr.setMeta(key, { remove: request });
    return true;
  }).insertContentAt(target.pos, [...images.map((image) => ({ type: "image", attrs: { ...image, alt: "" } })), { type: "paragraph" }]).run();
}

/** Tracks the insertion point through typing; deleting its block explicitly cancels the import. */
export const ImageInsertion = Extension.create<{ onRequest?: (request: ImageImportRequest) => void }>({
  name: "imageInsertion",
  priority: 1100,
  addProseMirrorPlugins() {
    const editor = this.editor, onRequest = this.options.onRequest;
    return [new Plugin<ReadonlyMap<string, Target>>({
      key,
      state: {
        init: () => new Map(),
        apply(tr, previous) {
          const next = new Map<string, Target>();
          for (const [id, target] of previous) {
            const mapped = tr.mapping.mapResult(target.pos, 1);
            next.set(id, { ...target, pos: mapped.pos, invalid: target.invalid || mapped.deletedAcross || Boolean((target.cut || target.replace || target.caption) && mapped.deleted) });
          }
          const meta = tr.getMeta(key) as { add?: Target; remove?: string } | undefined;
          if (meta?.add) next.set(meta.add.request, meta.add);
          if (meta?.remove) next.delete(meta.remove);
          return next;
        },
      },
      view: () => {
        const sent = new Set<string>();
        return { update(view) {
          for (const id of sent) if (!key.getState(view.state)?.has(id)) sent.delete(id);
          for (const [id, target] of key.getState(view.state) ?? []) if (!target.cut && !target.replace && !target.caption && !sent.has(id)) {
            sent.add(id);
            queueMicrotask(() => { if (!editor.isDestroyed) onRequest?.(target); });
          }
        } };
      },
      props: {
        handleDOMEvents: {
          paste: (_view, event) => {
            const files = Array.from(event.clipboardData?.files ?? []);
            if (!files.some(imageFile) || !onRequest) return false;
            event.preventDefault();
            if (!editor.isEditable || !allowed(editor.state.selection)) {
              queueMicrotask(() => onRequest({ request: `image-${++sequence}`, error: "unavailable" }));
              return true;
            }
            editor.commands.command((props) => requestImageCommand(props, files));
            return true;
          },
          drop: (view, event) => {
            const files = Array.from(event.dataTransfer?.files ?? []);
            if (!files.some(imageFile) || view.dragging || !onRequest) return false;
            event.preventDefault();
            const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? view.state.selection.to;
            if (!editor.isEditable || !allowedAt(view.state.doc.resolve(pos))) {
              queueMicrotask(() => onRequest({ request: `image-${++sequence}`, error: "unavailable" }));
              return true;
            }
            editor.commands.command((props) => requestImageCommand(props, files, pos));
            return true;
          },
        },
      },
    })];
  },
});
