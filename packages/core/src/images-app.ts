import type { AppState } from "./app.ts";
import { opErrorCode, type PlatformBridge } from "./bridge.ts";
import type { Store } from "./store.ts";
import type { CommandRegistry } from "./commands.ts";
import type { MessageCatalog } from "./messages.ts";
import type { ViewModelRegistry } from "./view-models.ts";
import { noteReadOnly } from "./workspace-app.ts";
import type { TaskTracker } from "./tasks.ts";

type SelectedImage = { pos: number; src: string; rounded: boolean; fitHeight: boolean; mode: string; width: number; height: number; from: number; to: number; count: number; roundMixed: boolean; limitMixed: boolean };
export interface ImagesState {
  sources: readonly { id: string; value: string; pending: boolean; failed: boolean }[];
  selected?: SelectedImage;
  edit: boolean;
  x: string; y: string; width: string; height: string;
  rotation: "0" | "90" | "180" | "270";
  saving: boolean;
  error: string;
}
export const IMAGES_CLOSED: ImagesState = { sources: [], edit: false, x: "0", y: "0", width: "", height: "", rotation: "0", saving: false, error: "" };

export function registerImages(ctx: {
  store: Store<AppState>; bridge: PlatformBridge; commands: CommandRegistry<AppState>; viewModels: ViewModelRegistry<AppState>; catalog: MessageCatalog;
  editorAction: (id: string, args?: Record<string, unknown>) => void;
  toast: (text: string, opts?: { tone?: "info" | "error"; subject?: string }) => number;
  tracker: TaskTracker;
  itemSchema: Record<string, unknown>; describeItem: (id: string) => Record<string, unknown>;
}) {
  const { store, bridge, commands, viewModels, catalog } = ctx;
  const state = () => store.state.ui.images;
  const set = (patch: Partial<ImagesState>) => store.update((s) => ({ ...s, ui: { ...s.ui, images: { ...s.ui.images, ...patch } } }));
  let noteKey = store.state.note.key;
  const reading = new Map<string, symbol>();
  const notified = new Set<string>();
  store.subscribe(() => {
    if (store.state.note.key === noteKey) return;
    noteKey = store.state.note.key;
    reading.clear();
    notified.clear();
    set(IMAGES_CLOSED);
  });
  const writable = () => Boolean(state().selected) && !noteReadOnly(store.state);
  const failed = (src: string, error: unknown) => {
    console.error("Image read failed", opErrorCode(error));
    const previous = state().sources.find(s => s.id === src);
    set({ sources: [...state().sources.filter(s => s.id !== src), { id: src, value: previous?.value ?? "", pending: false, failed: true }] });
    if (!notified.has(src)) {
      notified.add(src);
      ctx.toast(catalog.format("image.read.notice"), { tone: "error", subject: `image.read:${noteKey}` });
    }
  };
  const read = async (src: string, key?: string, retry = false) => {
    const note = store.state.note.path;
    const document = store.state.note.key;
    const previous = state().sources.find(s => s.id === src);
    if (!note || key !== undefined && key !== document || reading.has(src) || previous && !retry) return;
    const request = Symbol();
    reading.set(src, request);
    set({ sources: [...state().sources.filter(s => s.id !== src), { id: src, value: previous?.value ?? "", failed: previous?.failed ?? false, pending: true }] });
    try {
      const data = await ctx.tracker.section("image.read", "image.read.loading", async () => {
        if (!bridge.readImage) throw new Error("Image reader unavailable");
        const result = await bridge.readImage(note, src);
        if (!result.startsWith("data:image/")) throw new Error("Invalid image source");
        return result;
      }, "fn:image.read");
      if (store.state.note.path === note && store.state.note.key === document) {
        set({ sources: [...state().sources.filter(s => s.id !== src), { id: src, value: data, pending: false, failed: false }] });
      }
    } catch (error) {
      if (store.state.note.path === note && store.state.note.key === document) failed(src, error);
    } finally { if (reading.get(src) === request) reading.delete(src); }
  };
  commands.register<{ src: string; key?: string }>({ id: "image.read", title: "image.menu", run: ({ src, key }) => read(src, key) });
  commands.register<{ src: string; key?: string }>({ id: "image.retry", title: "commit.retry", run: ({ src, key }) => read(src, key, true) });
  commands.register<{ src: string; value: string; key: string }>({
    id: "image.failed", title: "image.menu",
    run: ({ src, value, key }) => {
      const cached = state().sources.find(s => s.id === src);
      if (key === store.state.note.key && cached?.value === value && !cached.failed && !cached.pending) failed(src, new Error("Image decode failed"));
    },
  });
  commands.register<SelectedImage>({ id: "image.select", title: "image.menu", run: (selected) => set({ selected }) });
  for (const field of ["rounded", "fitHeight"] as const) {
    commands.register({
      id: `image.${field}`, title: field === "rounded" ? "image.rounded" : "image.limit", enabled: writable,
      checked: () => state().selected?.[field] === true,
      run: () => {
        const selected = state().selected;
        if (!selected) return;
        const next = { ...selected, [field]: !selected[field], [field === "rounded" ? "roundMixed" : "limitMixed"]: false };
        ctx.editorAction("image.set", { pos: selected.pos, src: selected.src, from: selected.from, to: selected.to, [field]: !selected[field] });
        set({ selected: next });
      },
    });
  }
  for (const mode of ["column", "wide", "actual"] as const) commands.register({
    id: `image.mode.${mode}`, title: `image.view.${mode}`, enabled: writable, checked: () => state().selected?.mode === mode,
    run: () => {
      const selected = state().selected;
      if (!selected) return;
      const next = { ...selected, mode };
      ctx.editorAction("image.set", { pos: selected.pos, src: selected.src, from: selected.from, to: selected.to, mode });
      set({ selected: next });
    },
  });
  const dataOf = () => {
    const source = state().sources.find(s => s.id === state().selected?.src);
    return source && !source.failed && !source.pending ? source.value : "";
  };
  const canEdit = () => writable() && state().selected?.count === 1 && Boolean(bridge.writeImage) && /^data:image\/(png|jpeg|webp);/.test(dataOf()) && !state().selected?.src.startsWith("data:");
  const valid = () => {
    const s = state(), image = s.selected;
    const [x, y, width, height] = [s.x, s.y, s.width, s.height].map(Number);
    return Boolean(image && [x, y, width, height].every(Number.isFinite) && x! >= 0 && y! >= 0 && width! > 0 && height! > 0 && x! + width! <= image.width && y! + height! <= image.height);
  };
  commands.register({
    id: "image.edit", title: "image.edit.title", enabled: canEdit,
    run: () => {
      const image = state().selected;
      if (image) set({ edit: true, x: "0", y: "0", width: String(image.width), height: String(image.height), rotation: "0", error: "" });
    },
  });
  commands.register({ id: "image.edit.close", title: "image.edit.cancel", enabled: () => !state().saving, run: () => set({ edit: false, error: "" }) });
  for (const field of ["x", "y", "width", "height"] as const) commands.register<{ value: string }>({
    id: `image.edit.${field}`, title: "image.edit.title",
    run: ({ value }) => set({ [field]: value, error: "" }),
  });
  commands.register<{ id: string }>({
    id: "image.edit.rotate", title: "image.edit.turn",
    run: ({ id }) => {
      if (id === "reset") return set({ x: "0", y: "0", width: String(state().selected?.width ?? 0), height: String(state().selected?.height ?? 0), rotation: "0" });
      const rotation = (Number(state().rotation) + (id === "left" ? 270 : 90)) % 360;
      set({ rotation: rotation === 90 ? "90" : rotation === 180 ? "180" : rotation === 270 ? "270" : "0" });
    },
  });
  let savingNote = "";
  commands.register({
    id: "image.edit.save", title: "image.edit.save", enabled: () => canEdit() && valid() && !state().saving,
    run: () => {
      savingNote = store.state.note.path ?? "";
      set({ saving: true, error: "" });
      ctx.editorAction("image.renderEdit", { src: state().selected?.src, data: dataOf(), x: Number(state().x), y: Number(state().y), width: Number(state().width), height: Number(state().height), rotation: Number(state().rotation) });
    },
  });
  commands.register<{ src: string; data: string }>({
    id: "image.edited", title: "image.edit.save",
    run: async ({ src, data }) => {
      if (!state().saving || src !== state().selected?.src || savingNote !== store.state.note.path || !bridge.writeImage) return;
      try {
        await bridge.writeImage(savingNote, src, data, dataOf());
        if (savingNote !== store.state.note.path) return;
        set({ saving: false, edit: false, sources: state().sources.map((s) => s.id === src ? { ...s, value: data, pending: false, failed: false } : s) });
        ctx.toast(catalog.format("image.edit.saved"));
      } catch { set({ saving: false, error: catalog.format("image.edit.failed") }); }
    },
  });
  commands.register({ id: "image.edit.failed", title: "image.edit.title", run: () => set({ saving: false, error: catalog.format("image.edit.failed") }) });
  viewModels.register({
    id: "vm.images",
    reads: ["ui.images", "note.path", "workspace"],
    setters: { x: "image.edit.x", y: "image.edit.y", width: "image.edit.width", height: "image.edit.height" },
    schema: { type: "object", properties: {
      sources: { type: "array", items: { type: "object", properties: { id: { type: "string" }, value: { type: "string" }, pending: { type: "boolean" }, failed: { type: "boolean" } } } },
      menu: { type: "array", items: { type: "object", properties: { id: { type: "string" }, items: { type: "array", items: ctx.itemSchema } } } },
      edit: { type: "boolean" }, saving: { type: "boolean" }, invalid: { type: "boolean" }, error: { type: "string" }, src: { type: "string" }, rotation: { type: "string", enum: ["0", "90", "180", "270"] },
      x: { type: "string" }, y: { type: "string" }, width: { type: "string" }, height: { type: "string" },
      cropX: { type: "number" }, cropY: { type: "number" }, cropWidth: { type: "number" }, cropHeight: { type: "number" },
      rotations: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, icon: { type: "string" } } } },
    } },
    select: () => {
      const s = state();
      return { ...s, invalid: !valid(), src: dataOf(),
        cropX: Number(s.x) / (s.selected?.width || 1) * 100, cropY: Number(s.y) / (s.selected?.height || 1) * 100,
        cropWidth: Number(s.width) / (s.selected?.width || 1) * 100, cropHeight: Number(s.height) / (s.selected?.height || 1) * 100,
        menu: [{ id: "display", items: ["image.mode.column", "image.mode.wide", "image.mode.actual", "image.rounded", "image.fitHeight"].map((id) => ({ ...ctx.describeItem(id), ...(id === "image.rounded" ? { mixed: s.selected?.roundMixed ?? false } : id === "image.fitHeight" ? { mixed: s.selected?.limitMixed ?? false } : {}) })) }, ...(s.selected?.count === 1 ? [{ id: "edit", items: [ctx.describeItem("image.edit")] }] : [])],
        rotations: [{ id: "left", label: catalog.format("image.turn.left"), icon: "undo" }, { id: "right", label: catalog.format("image.turn.right"), icon: "redo" }, { id: "reset", label: catalog.format("image.turn.reset") }],
      };
    },
  });
}
