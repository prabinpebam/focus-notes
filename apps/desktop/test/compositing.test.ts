/**
 * D-121: the shell reads Chromium's compositing status, and the override for journeys and diagnosis.
 * Only an enabled status is the GPU; a disabled or unavailable one is software, and the renderer
 * then shows the note's edge fade without the blur. A GPU crash reads it again.
 */
import { describe, expect, it, vi } from "vitest";
import { compositingFrom, watchCompositing } from "../src/main/window/compositing.ts";

describe("compositingFrom", () => {
  it("is the GPU for an enabled status", () => {
    for (const s of ["enabled", "enabled_on", "enabled_force", "enabled_readback"]) expect(compositingFrom(s)).toBe("gpu");
  });
  it("is software for a disabled or unavailable status", () => {
    for (const s of ["disabled_software", "unavailable_software", "disabled_off", "unavailable_off"]) expect(compositingFrom(s)).toBe("software");
  });
  it("is the GPU when the status is unknown", () => {
    expect(compositingFrom(undefined)).toBe("gpu");
    expect(compositingFrom("")).toBe("gpu");
  });
  it("follows FOCUS_NOTES_GPU_COMPOSITING's gpu or software over the status, and ignores other values", () => {
    expect(compositingFrom("enabled", "software")).toBe("software");
    expect(compositingFrom("disabled_software", "gpu")).toBe("gpu");
    expect(compositingFrom("disabled_software", "fast")).toBe("software");
  });
});

describe("watchCompositing", () => {
  const fakeApp = (status: string) => {
    const handlers: Record<string, (...args: never[]) => void> = {};
    const app = {
      status,
      getGPUFeatureStatus: () => ({ gpu_compositing: app.status }),
      on: (event: string, l: (...args: never[]) => void) => ((handlers[event] = l), app),
      emit: (event: string, ...args: unknown[]) => (handlers[event] as (...a: unknown[]) => void)?.(...args),
    };
    return app;
  };

  it("is the GPU until Chromium's information comes in, then logs the status once, and again only when it changes", () => {
    const app = fakeApp("disabled_software");
    const lines: string[] = [];
    const seen: string[] = [];
    const w = watchCompositing(app, undefined, (l) => lines.push(l));
    w.onChange((c) => seen.push(c));
    // Before the GPU's information, even a GPU reads "disabled_software": it isn't trusted yet.
    expect(w.current()).toBe("gpu");
    expect(lines).toEqual([]);
    app.status = "enabled";
    app.emit("gpu-info-update");
    expect(lines).toEqual(["compositing: gpu (gpu_compositing=enabled)"]);
    app.emit("gpu-info-update");
    expect(lines).toHaveLength(1);
    expect(seen).toEqual([]);
    // The GPU process went away and came back in software.
    app.status = "unavailable_software";
    app.emit("child-process-gone", {}, { type: "Utility" });
    expect(w.current()).toBe("gpu");
    app.emit("child-process-gone", {}, { type: "GPU" });
    expect(w.current()).toBe("software");
    expect(seen).toEqual(["software"]);
    expect(lines[1]).toBe("compositing: software (gpu_compositing=unavailable_software)");
  });

  it("reads the status after a few seconds if Chromium never sends its GPU information", () => {
    vi.useFakeTimers();
    try {
      const app = fakeApp("unavailable_software");
      const lines: string[] = [];
      const w = watchCompositing(app, undefined, (l) => lines.push(l));
      expect(w.current()).toBe("gpu");
      vi.advanceTimersByTime(3000);
      expect(w.current()).toBe("software");
      expect(lines).toEqual(["compositing: software (gpu_compositing=unavailable_software)"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the override whatever Chromium reports", () => {
    const app = fakeApp("enabled");
    const lines: string[] = [];
    const w = watchCompositing(app, "software", (l) => lines.push(l));
    expect(w.current()).toBe("software");
    app.emit("gpu-info-update");
    expect(w.current()).toBe("software");
    expect(lines).toEqual(["compositing: software (gpu_compositing=enabled, override=software)"]);
  });
});
