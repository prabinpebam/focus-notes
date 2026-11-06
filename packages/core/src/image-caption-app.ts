import { CAPTION_IMAGE_BYTES, CAPTION_IMAGE_EDGE, aiRunsInCloud, type AiConnectionView } from "./ai-providers.ts";
import type { ImagesContext } from "./images-app.ts";
import { noteReadOnly } from "./workspace-app.ts";
import { opErrorCode } from "./bridge.ts";

export function registerImageCaption(ctx: ImagesContext): void {
  const { store, bridge, catalog, commands, viewModels, tracker } = ctx;
  let open = false, loading = false, writing = false, applying = false, stale = false;
  let instruction = catalog.format("image.ai.prompt"), result = "", error = "", integration = "", preview = "";
  let connections: AiConnectionView[] = [];
  let sequence = 0;
  let target: { request: string; key: string; note: string; pos: number; src: string; version: string } | undefined;
  let running: string | undefined;
  let finishTask: ((error?: Error) => void) | undefined;
  const finishTracking = (problem?: Error) => {
    finishTask?.(problem);
    finishTask = undefined;
  };
  const changed = () => store.update(s => ({ ...s }));
  const selected = () => store.state.ui.images.selected;
  const single = () => selected()?.count === 1 && !selected()?.text && Boolean(store.state.note.path) && !noteReadOnly(store.state) && !store.state.ui.images.saving && !store.state.ui.images.transferring;
  const fail = (key: string, problem: unknown) => {
    console.error("Image caption failed", opErrorCode(problem));
    error = catalog.format(key);
    if (key === "image.ai.stale") stale = true;
    writing = applying = loading = false;
    changed();
  };
  const stop = () => {
    const id = running;
    running = undefined;
    writing = false;
    finishTracking(new DOMException("Stopped", "AbortError"));
    if (id && bridge.ai?.captionCancel) void bridge.ai.captionCancel(id).catch(problem => {
      console.error("Image caption cancellation failed", opErrorCode(problem));
      if (open) fail("image.ai.failed", problem);
    });
    changed();
  };
  const close = () => {
    open = false;
    applying = loading = false;
    stop();
    if (target) ctx.editorAction("image.cancelImport", { request: target.request });
    target = undefined;
  };
  let noteKey = store.state.note.key;
  store.subscribe(() => {
    if (store.state.note.key === noteKey) return;
    noteKey = store.state.note.key;
    close();
  });
  commands.register({
    id: "image.ai", title: "image.ai.menu", icon: "sparkle", enabled: single,
    run: async () => {
      const image = selected(), note = store.state.note.path;
      if (!image || !note) return;
      close();
      const request = `image-caption-${++sequence}`;
      const current = { request, key: store.state.note.key, note, pos: image.pos, src: image.src, version: "" };
      target = current;
      open = loading = true;
      result = error = preview = integration = "";
      stale = false;
      instruction = catalog.format("image.ai.prompt");
      connections = [];
      ctx.editorAction("image.trackCaption", { request, pos: image.pos, src: image.src });
      changed();
      try {
        const [settings, data] = await tracker.section("image.caption.open", "image.ai.preparing", async () => {
          if (!bridge.readImage) throw new Error("image-reader-unavailable");
          return Promise.all([bridge.ai?.captionSettings?.() ?? Promise.resolve({ writer: "", connections: [] }), bridge.readImage(note, image.src)]);
        }, "fn:image.caption.open");
        if (target !== current) return;
        connections = settings.connections;
        integration = connections.find(c => c.id === settings.writer && c.imageCapable)?.id ?? "";
        preview = current.version = data;
        loading = false;
        if (connections.some(c => c.capabilityError)) error = catalog.format("image.ai.capability.failed");
        changed();
      } catch (problem) { if (target === current) fail("image.ai.failed", problem); }
    },
  });
  commands.register({ id: "image.ai.close", title: "image.edit.cancel", run: close });
  commands.register({ id: "image.ai.stop", title: "image.ai.stop", enabled: () => writing, run: stop });
  commands.register({ id: "image.ai.manual", title: "image.ai.write", enabled: () => open && !writing && single(), run: () => {
    const image = selected();
    close();
    if (image) ctx.editorAction("image.caption", { pos: image.pos, src: image.src });
  } });
  for (const field of ["instruction", "result", "integration"] as const) commands.register<{ value: string; id?: string }>({
    id: `image.ai.${field}`, title: `image.ai.${field}`, enabled: () => open && !writing && !applying,
    run: ({ value, id }) => {
      if (field === "instruction") instruction = value;
      if (field === "result") result = value;
      if (field === "integration") integration = id ?? value;
      changed();
    },
  });
  const canGenerate = () => open && !loading && !writing && !applying && !stale && Boolean(target) && instruction.trim().length > 0 && instruction.length <= 4000
    && connections.some(c => c.id === integration && c.imageCapable) && Boolean(bridge.ai?.captionStart && bridge.ai.onCaptionEvent);
  commands.register({
    id: "image.ai.generate", title: "image.ai.generate", enabled: canGenerate,
    run: () => {
      if (!target) return;
      running = `${target.request}-${++sequence}`;
      writing = true;
      result = error = "";
      changed();
      void tracker.run("image.caption.generate", "image.ai.writing", () => new Promise<void>((resolve, reject) => {
        finishTask = problem => problem ? reject(problem) : resolve();
      }), undefined, "fn:image.caption.generate", "none").catch(problem => {
        if (!(problem instanceof DOMException && problem.name === "AbortError")) console.error("Caption task failed", opErrorCode(problem));
      });
      ctx.editorAction("image.prepareCaption", { request: running, data: target.version, edge: CAPTION_IMAGE_EDGE, limit: CAPTION_IMAGE_BYTES });
    },
  });
  commands.register<{ request: string; data: string; error: string }>({
    id: "image.ai.prepared", title: "image.ai.generate",
    run: async ({ request, data, error: preparationError }) => {
      const ai = bridge.ai;
      if (!writing || running !== request || !ai?.captionStart) return;
      try {
        if (preparationError) throw new Error("image-preparation-failed");
        await ai.captionStart(request, { connection: integration, instruction, image: data });
      } catch (problem) { if (running === request) { running = undefined; finishTracking(new Error("caption-failed")); fail("image.ai.failed", problem); } }
    },
  });
  bridge.ai?.onCaptionEvent?.((event: unknown) => {
    if (!event || typeof event !== "object" || !("id" in event) || event.id !== running || !("type" in event)) return;
    if (event.type === "delta" && "text" in event && typeof event.text === "string") {
      if (result.length + event.text.length > 4000) { stop(); fail("image.ai.failed", new Error("caption-too-long")); return; }
      result += event.text;
      changed();
    } else if (event.type === "done") {
      running = undefined;
      writing = false;
      finishTracking(result.trim() ? undefined : new Error("caption-empty"));
      if (!result.trim()) fail("image.ai.failed", new Error("caption-empty"));
      else { ctx.announce(catalog.format("image.ai.ready")); changed(); }
    } else if (event.type === "error") {
      running = undefined;
      finishTracking(new Error("caption-provider-failed"));
      fail("image.ai.failed", new Error("caption-provider-failed"));
    }
  });
  commands.register({
    id: "image.ai.use", title: "image.ai.use", enabled: () => open && !writing && !applying && !stale && Boolean(target) && result.trim().length > 0 && result.length <= 4000,
    run: async () => {
      const current = target;
      if (!current || !bridge.readImage) return;
      applying = true;
      error = "";
      changed();
      try {
        const data = await bridge.readImage(current.note, current.src);
        if (target !== current) return;
        if (data !== current.version || noteReadOnly(store.state)) throw new Error("image-changed");
        ctx.editorAction("image.applyCaption", { request: current.request, title: result });
      } catch (problem) { if (target === current) fail("image.ai.stale", problem); }
    },
  });
  commands.register<{ request: string; accepted: boolean }>({
    id: "image.ai.applied", title: "image.ai.use", run: ({ request, accepted }) => {
      if (request !== target?.request) return;
      if (accepted) close();
      else fail("image.ai.stale", new Error("image-target-changed"));
    },
  });
  viewModels.register({
    id: "vm.imageCaption", reads: "*", setters: { instruction: "image.ai.instruction", result: "image.ai.result", integration: "image.ai.integration" },
    schema: { type: "object", properties: {
      open: { type: "boolean" }, loading: { type: "boolean" }, writing: { type: "boolean" }, applying: { type: "boolean" }, noVision: { type: "boolean" }, hasResult: { type: "boolean" },
      generateDisabled: { type: "boolean" }, useDisabled: { type: "boolean" },
      instruction: { type: "string" }, result: { type: "string" }, error: { type: "string" }, integration: { type: "string" }, preview: { type: "string" }, disclosure: { type: "string" }, chosen: { type: "string" },
      connectionName: { type: "string" }, connectionModel: { type: "string" }, connectionWhere: { type: "string" },
      choices: { type: "array", items: { type: "object", properties: { id: { type: "string" }, items: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, enabled: { type: "boolean" }, checked: { type: "boolean" } } } } } } },
    } },
    select: () => {
      const name = (c: AiConnectionView) => `${c.name} · ${c.model} · ${catalog.format(aiRunsInCloud(c.provider, c.endpoint, c.model, c.modelCloud) ? "ai.where.cloud" : "ai.where.local")}`;
      const choice = connections.find(c => c.id === integration);
      return { open, loading, writing, applying, instruction, result, error, integration, preview, noVision: !loading && !integration, hasResult: Boolean(result) && !writing,
        generateDisabled: !canGenerate(), useDisabled: writing || applying || stale || !result.trim() || result.length > 4000,
        choices: [{ id: "integrations", items: connections.filter(c => c.imageCapable).map(c => ({ id: c.id, label: name(c), enabled: true, checked: integration === c.id })) }],
        chosen: choice ? name(choice) : catalog.format("image.ai.choose"),
        connectionName: choice?.name ?? catalog.format("image.ai.choose"), connectionModel: choice?.model ?? "",
        connectionWhere: choice ? catalog.format(aiRunsInCloud(choice.provider, choice.endpoint, choice.model, choice.modelCloud) ? "ai.where.cloud" : "ai.where.local") : "",
        disclosure: choice ? catalog.format("image.ai.sends2", { name: name(choice) }) : "",
      };
    },
  });
}
