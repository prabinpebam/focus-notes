/**
 * D-121: GPU or software compositing in the app. The shell reports it; the app keeps it in state and
 * gives it to the root (vm.app.compositing), which turns the note's edge blur off in software. With
 * no report (the browser) it's the GPU, and the blur stays.
 */
import { describe, expect, it } from "vitest";
import { createApp, type CompositingBridge, type PlatformBridge } from "../src/index.ts";
import en from "../../views/messages/en.json" with { type: "json" };

const bridge = (compositing?: CompositingBridge): PlatformBridge => ({
  platform: "windows",
  readNote: async () => "# A\n",
  writeNote: async () => {},
  chooseNote: async () => undefined,
  newNotePath: async () => "/n/new.md",
  defaultNotePath: async () => "/n/a.md",
  loadAppState: async () => ({ version: 1 }),
  saveAppState: async () => {},
  systemScheme: () => "light",
  onSystemSchemeChange: () => () => {},
  ...(compositing ? { compositing } : {}),
});
const vm = (app: ReturnType<typeof createApp>) => app.viewModels.select("vm.app", app.store.state) as Record<string, unknown>;

describe("compositing (D-121)", () => {
  it("is the GPU where the shell can't tell (the browser), so the blur stays", () => {
    const app = createApp(bridge(), en);
    expect(app.store.state.compositing).toBe("gpu");
    expect(vm(app).compositing).toBe("gpu");
  });

  it("is software when the shell says so, and the GPU when it says GPU", () => {
    expect(vm(createApp(bridge({ initial: "software", onChange: () => () => {} }), en)).compositing).toBe("software");
    expect(vm(createApp(bridge({ initial: "gpu", onChange: () => () => {} }), en)).compositing).toBe("gpu");
  });

  it("follows a change, as after the GPU process crashed, and ignores anything else", () => {
    let send: ((c: unknown) => void) | undefined;
    const app = createApp(bridge({ initial: "gpu", onChange: (l) => ((send = l), () => {}) }), en);
    send!("software");
    expect(vm(app).compositing).toBe("software");
    send!("sideways");
    expect(vm(app).compositing).toBe("software");
    send!("gpu");
    expect(vm(app).compositing).toBe("gpu");
  });
});
