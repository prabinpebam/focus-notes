import type { AppState } from "./app.ts";
import { opErrorCode, type AppStateFile, type PlatformBridge } from "./bridge.ts";
import type { Store } from "./store.ts";
import type { CommandRegistry } from "./commands.ts";
import type { MessageCatalog } from "./messages.ts";
import type { ViewModelRegistry } from "./view-models.ts";
import { noteReadOnly } from "./workspace-app.ts";
import type { TaskTracker } from "./tasks.ts";
import { registerImageCaption } from "./image-caption-app.ts";

type SelectedImage = { pos: number; src: string; originalSrc?: string; alt?: string; title?: string; text?: boolean; announce?: boolean; rounded: boolean; fitHeight: boolean; mode: string; width: number; height: number; from: number; to: number; count: number; roundMixed: boolean; limitMixed: boolean };
export interface ImagesState {
  sources: readonly { id: string; value: string; pending: boolean; failed: boolean }[];
  selected?: SelectedImage;
  edit: boolean;
  x: string; y: string; width: string; height: string;
  rotation: "0" | "90" | "180" | "270";
  aspect: "free" | "original" | "square" | "fourThree" | "wide";
  flipHorizontal: boolean;
  flipVertical: boolean;
  resetSignal: boolean;
  targetChanged: boolean;
  saving: boolean;
  transferring: boolean;
  error: string;
  describe: boolean;
  alt: string;
  caption: string;
}
export const IMAGES_CLOSED: ImagesState = { sources: [], edit: false, x: "0", y: "0", width: "", height: "", rotation: "0", aspect: "free", flipHorizontal: false, flipVertical: false, resetSignal: false, targetChanged: false, saving: false, transferring: false, error: "", describe: false, alt: "", caption: "" };

export interface ImagesContext {
  store: Store<AppState>; bridge: PlatformBridge; commands: CommandRegistry<AppState>; viewModels: ViewModelRegistry<AppState>; catalog: MessageCatalog;
  editorAction: (id: string, args?: Record<string, unknown>) => void;
  toast: (text: string, opts?: { tone?: "info" | "error"; subject?: string }) => number;
  tracker: TaskTracker;
  appState: () => AppStateFile;
  persistAppState: (patch: Partial<AppStateFile>) => Promise<void>;
  announce: (text: string) => void;
  itemSchema: Record<string, unknown>; describeItem: (id: string) => Record<string, unknown>;
}

export function registerImages(ctx: ImagesContext) {
  registerImageCaption(ctx);
  const { store, bridge, commands, viewModels, catalog } = ctx;
  const state = () => store.state.ui.images;
  const set = (patch: Partial<ImagesState>) => store.update((s) => ({ ...s, ui: { ...s.ui, images: { ...s.ui.images, ...patch } } }));
  let sequence = 0;
  let draftRequest: string | undefined;
  let pending: { request: string; note: string; key: string; selected: SelectedImage; expected: string; finish: () => void } | undefined;
  let noteKey = store.state.note.key;
  const reading = new Map<string, symbol>();
  const notified = new Set<string>();
  store.subscribe(() => {
    if (store.state.note.key === noteKey) return;
    noteKey = store.state.note.key;
    pending?.finish(); pending = undefined; draftRequest = undefined;
    reading.clear();
    notified.clear();
    set(IMAGES_CLOSED);
  });
  const writable = () => (state().selected?.count ?? 0) > 0 && !noteReadOnly(store.state);
  const single = () => writable() && state().selected?.count === 1 && !state().selected?.text;
  let transfer = 0;
  let remembering = Promise.resolve();
  const transferError = (id: string, problem: unknown) => {
    console.error("Image transfer failed", opErrorCode(problem));
    ctx.toast(catalog.format(id), { tone: "error" });
  };
  const readableSingle = () => state().selected?.count === 1 && !state().selected?.text && !state().transferring;
  for (const action of ["copy", "cut"] as const) commands.register({
    id: `image.${action}`, title: `image.${action}`, enabled: () => readableSingle() && Boolean(bridge.copyImage) && (action !== "cut" || single()),
    run: async () => {
      const image = state().selected;
      const note = store.state.note.path, key = store.state.note.key;
      const copy = bridge.copyImage;
      if (!image || !note || !copy) return;
      const request = `image-cut-${++transfer}`;
      set({ transferring: true });
      if (action === "cut") ctx.editorAction("image.trackCut", { request, pos: image.pos, src: image.src });
      try {
        await ctx.tracker.section("image.copy", "image.copy.loading", () => copy(note, image.src, image.alt ?? "", image.title ?? ""), "fn:image.copy");
        if (action === "cut") {
          if (store.state.note.key !== key || noteReadOnly(store.state)) throw new Error("image-target-changed");
          ctx.editorAction("image.finishCut", { request });
        }
      } catch (problem) {
        ctx.editorAction("image.cancelImport", { request });
        transferError("image.copy.failed", problem);
      } finally { if (store.state.note.key === key) set({ transferring: false }); }
    },
  });
  commands.register({ id: "image.cut.failed", title: "image.cut", run: () => transferError("image.copy.failed", new Error("image-target-changed")) });
  commands.register({
    id: "image.replace", title: "image.replace", enabled: () => single() && !state().transferring && Boolean(bridge.importImages),
    run: async () => {
      const image = state().selected, note = store.state.note.path, key = store.state.note.key;
      const importImages = bridge.importImages;
      if (!image || !note || !importImages) return;
      const request = `image-replace-${++transfer}`;
      let batch: string | undefined;
      set({ transferring: true });
      ctx.editorAction("image.trackReplacement", { request, pos: image.pos, src: image.src });
      try {
        const imported = await ctx.tracker.section("image.replace", "image.replace.loading", () => importImages(note, undefined, true), "fn:image.replace");
        if (!imported) { ctx.editorAction("image.cancelImport", { request }); return; }
        batch = imported.batch;
        if (store.state.note.key !== key || noteReadOnly(store.state) || imported.images.length !== 1) throw new Error("image-target-changed");
        ctx.editorAction("image.insertAssets", { request, batch, images: imported.images });
        batch = undefined;
      } catch (problem) {
        if (batch) await bridge.finishImageImport?.(batch, false);
        ctx.editorAction("image.cancelImport", { request });
        transferError("image.replace.failed", problem);
      } finally { if (store.state.note.key === key) set({ transferring: false }); }
    },
  });
  commands.register({
    id: "image.save", title: "image.save", enabled: () => readableSingle() && Boolean(bridge.saveImage),
    run: async () => {
      const image = state().selected, note = store.state.note.path, key = store.state.note.key;
      const save = bridge.saveImage;
      if (!image || !note || !save) return;
      set({ transferring: true });
      try {
        if (await ctx.tracker.section("image.save", "image.save.loading", () => save(note, image.src), "fn:image.save")) ctx.toast(catalog.format("image.save.saved"));
      } catch (problem) { transferError("image.save.failed", problem); }
      finally { if (store.state.note.key === key) set({ transferring: false }); }
    },
  });
  let descriptionTarget: SelectedImage | undefined;
  commands.register({
    id: "image.describe", title: "image.describe.menu", enabled: single,
    run: () => {
      descriptionTarget = state().selected;
      set({ describe: true, alt: descriptionTarget?.alt ?? "", caption: descriptionTarget?.title ?? "" });
    },
  });
  commands.register({ id: "image.describe.close", title: "image.edit.cancel", run: () => { descriptionTarget = undefined; set({ describe: false }); } });
  for (const field of ["alt", "caption"] as const) commands.register<{ value: string }>({
    id: `image.describe.${field}`, title: `image.describe.${field}`, run: ({ value }) => set({ [field]: value }),
  });
  commands.register({
    id: "image.describe.save", title: "image.describe.save", enabled: () => state().describe && single(),
    run: () => {
      if (!descriptionTarget) return;
      ctx.editorAction("image.words", { pos: descriptionTarget.pos, src: descriptionTarget.src, alt: state().alt, title: state().caption || null });
      descriptionTarget = undefined;
      set({ describe: false });
    },
  });
  commands.register({
    id: "image.caption", title: "image.caption.add", enabled: single,
    run: () => {
      const image = state().selected;
      if (image) ctx.editorAction("image.caption", { pos: image.pos, src: image.src });
    },
  });
  commands.register({
    id: "image.insert", title: "command.image.insert", icon: "image", group: "formatting", layer: "writer",
    enabled: (s) => s.note.status === "ready" && !noteReadOnly(s) && !s.ui.format.inTable && !s.ui.format.codeBlock,
    run: () => ctx.editorAction("image.insert"),
  });
  commands.register<{ request: string; key: string; data?: string; error?: string }>({
    id: "image.import", title: "command.image.insert",
    run: async ({ request, key, data, error }) => {
      const note = store.state.note.path;
      if (key !== store.state.note.key || !note || noteReadOnly(store.state)) {
        ctx.editorAction("image.cancelImport", { request });
        ctx.toast(catalog.format("image.import.unavailable"), { tone: "error" });
        return;
      }
      let batch: string | undefined;
      try {
        if (error) throw new Error(error);
        const importImages = bridge.importImages;
        if (!importImages) throw new Error("image-import-unavailable");
        const parsed: unknown = data ? JSON.parse(data) : undefined;
        const isInput = (item: unknown): item is { data: string } => Boolean(item && typeof item === "object" && "data" in item && typeof item.data === "string");
        let inputs: { data: string }[] | undefined;
        if (parsed !== undefined) {
          if (!Array.isArray(parsed) || !parsed.every(isInput)) throw new Error("invalid-image");
          inputs = parsed;
        }
        const imported = await ctx.tracker.section("image.import", "image.import.loading", () => importImages(note, inputs), "fn:image.import");
        if (!imported) { ctx.editorAction("image.cancelImport", { request }); return; }
        batch = imported.batch;
        if (store.state.note.path !== note || store.state.note.key !== key || noteReadOnly(store.state)) throw new Error("image-target-changed");
        ctx.editorAction("image.insertAssets", { request, batch, images: imported.images.map(image => ({ ...image, ...(ctx.appState().imageDefaults ?? { rounded: false, fitHeight: true }) })) });
        batch = undefined;
      } catch (problem) {
        if (batch) await bridge.finishImageImport?.(batch, false);
        ctx.editorAction("image.cancelImport", { request });
        const reason = /(?:^|:\s)(image-too-large|image-pixels|animated-image|image-count|invalid-image|image-target-changed|unavailable)\s*$/.exec(problem instanceof Error ? problem.message : "")?.[1] ?? "failed";
        console.error("Image import failed", reason);
        const message = catalog.has(`image.import.${reason}`) ? `image.import.${reason}` : "image.import.failed";
        ctx.toast(catalog.format(message), { tone: "error" });
      }
    },
  });
  commands.register<{ batch: string; accepted: boolean }>({
    id: "image.imported", title: "command.image.insert",
    run: async ({ batch, accepted }) => {
      if (!bridge.finishImageImport) throw new Error("Image importer unavailable");
      await bridge.finishImageImport(batch, accepted);
      if (!accepted) ctx.toast(catalog.format("image.import.image-target-changed"), { tone: "error" });
    },
  });
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
  commands.register<SelectedImage>({ id: "image.select", title: "image.menu", run: (selected) => {
    set({ selected });
    if (selected.announce) ctx.announce(catalog.format(selected.alt ? "image.selectedNamed" : "image.selected", { alt: selected.alt ?? "" }));
  } });
  for (const field of ["rounded", "fitHeight"] as const) {
    commands.register({
      id: `image.${field}`, title: field === "rounded" ? "image.rounded" : "image.limit", enabled: writable,
      checked: () => state().selected?.[field] === true,
      run: async () => {
        const selected = state().selected;
        if (!selected) return;
        const next = { ...selected, [field]: !selected[field], [field === "rounded" ? "roundMixed" : "limitMixed"]: false };
        ctx.editorAction("image.set", { pos: selected.pos, src: selected.src, from: selected.from, to: selected.to, [field]: !selected[field] });
        set({ selected: next });
        ctx.announce(catalog.format(field === "rounded" ? "image.announce.rounded" : "image.announce.limit", { state: next[field] ? "on" : "off" }));
        const writing = remembering.then(() => ctx.tracker.section("image.defaults", "image.defaults.loading", () =>
          ctx.persistAppState({ imageDefaults: { ...(ctx.appState().imageDefaults ?? { rounded: false, fitHeight: true }), [field]: next[field] } }), "fn:image.defaults"));
        remembering = writing.catch((problem) => {
          console.error("Image defaults save failed", opErrorCode(problem));
          ctx.toast(catalog.format("image.defaults.failed"), { tone: "error" });
        });
        await remembering;
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
  const canEdit = () => writable() && state().selected?.count === 1 && Boolean(bridge.createImageCopy) && /^data:image\/(png|jpeg|webp);/.test(dataOf()) && !state().selected?.src.startsWith("data:");
  const valid = () => {
    const s = state(), image = s.selected;
    const [x, y, width, height] = [s.x, s.y, s.width, s.height].map(Number);
    return Boolean(image && [x, y, width, height].every(Number.isFinite) && x! >= 0 && y! >= 0 && width! > 0 && height! > 0 && x! + width! <= 100.000001 && y! + height! <= 100.000001);
  };
  commands.register({
    id: "image.edit", title: "image.edit.title", enabled: canEdit,
    run: () => {
      const image = state().selected;
      if (image) {
        draftRequest = `crop-${++sequence}`;
        ctx.editorAction("image.trackEdit", { request: draftRequest, pos: image.pos, src: image.src });
        set({ edit: true, x: "0", y: "0", width: "100", height: "100", rotation: "0", aspect: "free", flipHorizontal: false, flipVertical: false, resetSignal: !state().resetSignal, targetChanged: false, error: "" });
      }
    },
  });
  commands.register({ id: "image.edit.close", title: "image.edit.cancel", enabled: () => !state().saving, run: () => {
    if (draftRequest) ctx.editorAction("image.cancelImport", { request: draftRequest });
    draftRequest = undefined; set({ edit: false, error: "" });
  } });
  for (const field of ["x", "y", "width", "height"] as const) commands.register<{ value: string }>({
    id: `image.edit.${field}`, title: "image.edit.title",
    run: ({ value }) => set({ [field]: value, error: "" }),
  });
  commands.register<{ x: number; y: number; width: number; height: number }>({
    id: "image.edit.crop", title: "image.edit.title", enabled: () => state().edit && !state().saving,
    run: ({ x, y, width, height }) => {
      if (![x, y, width, height].every(Number.isFinite) || x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 100.000001 || y + height > 100.000001) throw new Error("invalid-crop");
      set({ x: String(x), y: String(y), width: String(width), height: String(height), error: "" });
    },
  });
  commands.register<{ id: ImagesState["aspect"] }>({
    id: "image.edit.aspect", title: "image.edit.title", enabled: () => state().edit && !state().saving,
    run: ({ id }) => {
      if (!["free", "original", "square", "fourThree", "wide"].includes(id)) throw new Error("invalid-aspect");
      set({ aspect: id, resetSignal: !state().resetSignal });
    },
  });
  for (const field of ["flipHorizontal", "flipVertical"] as const) commands.register({
    id: `image.edit.${field}`, title: field === "flipHorizontal" ? "image.flip.horizontal" : "image.flip.vertical",
    enabled: () => state().edit && !state().saving,
    run: () => set({ [field]: !state()[field] }),
  });
  commands.register<{ id: string }>({
    id: "image.edit.rotate", title: "image.edit.turn",
    enabled: () => state().edit && !state().saving,
    run: ({ id }) => {
      if (id === "reset") return set({ x: "0", y: "0", width: "100", height: "100", rotation: "0", aspect: "free", flipHorizontal: false, flipVertical: false, resetSignal: !state().resetSignal, error: "" });
      const rotation = (Number(state().rotation) + (id === "left" ? 270 : 90)) % 360;
      set({ rotation: rotation === 90 ? "90" : rotation === 180 ? "180" : rotation === 270 ? "270" : "0" });
    },
  });
  commands.register({
    id: "image.edit.save", title: "image.edit.save", enabled: () => canEdit() && state().edit && valid() && !state().saving && !state().targetChanged,
    run: () => {
      const selected = state().selected!;
      if (state().x === "0" && state().y === "0" && state().width === "100" && state().height === "100" && state().rotation === "0" && !state().flipHorizontal && !state().flipVertical) {
        if (draftRequest) ctx.editorAction("image.cancelImport", { request: draftRequest });
        draftRequest = undefined; set({ edit: false }); return;
      }
      if (!draftRequest) throw new Error("image-target-changed");
      const request = draftRequest;
      let finish!: () => void;
      const completed = new Promise<void>(resolve => { finish = resolve; });
      pending = { request, note: store.state.note.path!, key: store.state.note.key, selected: { ...selected }, expected: dataOf(), finish };
      set({ saving: true, error: "" });
      void ctx.tracker.section("image.edit.save", "image.edit.saving", () => completed, "fn:image.edit.save", "none");
      ctx.editorAction("image.renderEdit", { request, src: selected.src, data: dataOf(), x: Number(state().x), y: Number(state().y), width: Number(state().width), height: Number(state().height), rotation: Number(state().rotation), flipHorizontal: state().flipHorizontal, flipVertical: state().flipVertical });
    },
  });
  const current = (operation: NonNullable<typeof pending>) => pending === operation && operation.note === store.state.note.path && operation.key === store.state.note.key;
  commands.register<{ src: string; data: string; request: string }>({
    id: "image.edited", title: "image.edit.save",
    run: async ({ src, data, request }) => {
      const operation = pending;
      if (!operation || operation.request !== request || !current(operation) || !state().saving || src !== operation.selected.src || !bridge.createImageCopy) return;
      try {
        const image = await bridge.createImageCopy(operation.note, src, data, operation.expected);
        if (!current(operation)) return;
        set({ sources: [...state().sources, { id: image.src, value: data, pending: false, failed: false }] });
        ctx.editorAction("image.applyEdit", { request, image: { ...image, originalSrc: operation.selected.originalSrc || operation.selected.src } });
      } catch (error) {
        console.error("Image crop copy failed", opErrorCode(error));
        operation.finish();
        if (current(operation)) { pending = undefined; set({ saving: false, error: catalog.format("image.edit.failed") }); }
      }
    },
  });
  commands.register<{ request: string; accepted: boolean }>({
    id: "image.edit.applied", title: "image.edit.save",
    run: ({ request, accepted }) => {
      if (!pending || pending.request !== request || !current(pending)) return;
      pending.finish();
      pending = undefined;
      if (accepted) draftRequest = undefined;
      set({ saving: false, edit: !accepted, targetChanged: !accepted, error: accepted ? "" : catalog.format("image.edit.changed") });
      if (accepted) ctx.toast(catalog.format("image.edit.saved"));
    },
  });
  commands.register<{ request: string }>({ id: "image.edit.failed", title: "image.edit.title", run: ({ request }) => {
    if (!pending || pending.request !== request || !current(pending)) return;
    pending.finish();
    pending = undefined; set({ saving: false, error: catalog.format("image.edit.failed") });
  } });
  commands.register({
    id: "image.restore", title: "image.restore", enabled: () => writable() && state().selected?.count === 1 && Boolean(state().selected?.originalSrc) && !state().saving,
    run: () => {
      const image = state().selected!;
      ctx.editorAction("image.restore", { pos: image.pos, src: image.src, originalSrc: image.originalSrc });
    },
  });
  commands.register({ id: "image.restore.failed", title: "image.restore", run: () => { ctx.toast(catalog.format("image.edit.failed"), { tone: "error" }); } });
  const imageSection = (s: AppState) => ({
    id: "images", label: catalog.format("image.selection", { count: s.ui.images.selected?.count ?? 0 }),
    items: ["image.rounded", "image.fitHeight"].map((id) => ({
      ...ctx.describeItem(id), mixed: id === "image.rounded" ? s.ui.images.selected?.roundMixed ?? false : s.ui.images.selected?.limitMixed ?? false,
    })),
  });
  viewModels.register({
    id: "vm.images",
    reads: ["ui.images", "note.path", "workspace"],
    setters: { x: "image.edit.x", y: "image.edit.y", width: "image.edit.width", height: "image.edit.height", alt: "image.describe.alt", caption: "image.describe.caption" },
    schema: { type: "object", properties: {
      sources: { type: "array", items: { type: "object", properties: { id: { type: "string" }, value: { type: "string" }, pending: { type: "boolean" }, failed: { type: "boolean" } } } },
      menu: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, items: { type: "array", items: ctx.itemSchema } } } },
      edit: { type: "boolean" }, saving: { type: "boolean" }, invalid: { type: "boolean" }, error: { type: "string" }, src: { type: "string" }, rotation: { type: "string", enum: ["0", "90", "180", "270"] },
      describe: { type: "boolean" }, alt: { type: "string" }, caption: { type: "string" },
      invalidReason: { type: "string" },
      x: { type: "string" }, y: { type: "string" }, width: { type: "string" }, height: { type: "string" },
      cropX: { type: "number" }, cropY: { type: "number" }, cropWidth: { type: "number" }, cropHeight: { type: "number" },
      intrinsicWidth: { type: "number" }, intrinsicHeight: { type: "number" }, aspect: { type: "string", enum: ["free", "original", "square", "fourThree", "wide"] },
      flipHorizontal: { type: "boolean" }, flipVertical: { type: "boolean" }, resetSignal: { type: "boolean" },
      handles: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" } } } },
      aspects: { type: "array", items: { type: "object", properties: { id: { type: "string" }, items: { type: "array", items: ctx.itemSchema } } } },
      rotations: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, icon: { type: "string" } } } },
    } },
    select: () => {
      const s = state();
      return { ...s, invalid: !valid() || s.targetChanged, invalidReason: catalog.format(s.targetChanged ? "image.edit.changed" : "image.edit.invalid"), alt: s.edit ? s.selected?.alt || "" : s.alt, src: dataOf(),
        cropX: Number(s.x), cropY: Number(s.y), cropWidth: Number(s.width), cropHeight: Number(s.height),
        intrinsicWidth: s.selected?.width || 1, intrinsicHeight: s.selected?.height || 1,
        handles: ["nw", "n", "ne", "e", "se", "s", "sw", "w", "move"].map(id => ({ id, label: catalog.format(`image.handle.${id}`) })),
        aspects: [{ id: "aspects", items: ["free", "original", "square", "fourThree", "wide"].map(id => ({ id, label: catalog.format(`image.aspect.${id}`), checked: s.aspect === id })) }],
        menu: s.selected?.count === 1 && !s.selected.text ? [
          { id: "clipboard", items: ["image.cut", "image.copy"].map(ctx.describeItem) },
          { id: "file", items: ["image.replace", "image.save"].map(ctx.describeItem) },
          { id: "words", items: [ctx.describeItem("image.describe"), { ...ctx.describeItem("image.caption"), label: catalog.format(s.selected.title ? "image.caption.edit" : "image.caption.add") }] },
          { id: "assistance", items: [ctx.describeItem("image.ai")] },
          { id: "pixels", items: [ctx.describeItem("image.edit"), ...(s.selected.originalSrc ? [ctx.describeItem("image.restore")] : [])] },
          { id: "mode", label: catalog.format("image.display"), items: ["image.mode.column", "image.mode.wide", "image.mode.actual"].map(ctx.describeItem) },
          { id: "look", items: imageSection(store.state).items },
        ] : s.selected?.count ? [imageSection(store.state)] : [],
        rotations: [{ id: "left", label: catalog.format("image.turn.left"), icon: "undo" }, { id: "right", label: catalog.format("image.turn.right"), icon: "redo" }, { id: "reset", label: catalog.format("image.turn.reset") }],
      };
    },
  });
  return { textSections: (s: AppState) => s.ui.images.selected?.text && s.ui.images.selected.count > 0 ? [imageSection(s)] : [] };
}
