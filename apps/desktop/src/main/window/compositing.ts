/**
 * How the window is composited (D-121): on the GPU, or in software (no GPU, a remote desktop, a
 * virtual machine, a blocklisted driver). The note's progressive edge blur (D-111) stacks eight
 * backdrop filters; drawn in software they drop the window to a few frames a second, so there the
 * renderer shows the edge's canvas-colored fade alone.
 *
 * Chromium's own report (`app.getGPUFeatureStatus().gpu_compositing`) is read when the GPU's
 * information updates, and again after the GPU process goes away (it may come back in software).
 * `FOCUS_NOTES_GPU_COMPOSITING=gpu` or `software` overrides it, for journeys and to diagnose.
 */
export type Compositing = "gpu" | "software";

/**
 * The compositing to use from Chromium's status ("enabled", "enabled_on", "disabled_software",
 * "unavailable_software", …) and an override. Only an "enabled" status is the GPU; an unknown or
 * missing one is the GPU too, as the blur is the design and the fallback is a safety net.
 */
export function compositingFrom(status: string | undefined, override?: string): Compositing {
  if (override === "gpu" || override === "software") return override;
  if (!status) return "gpu";
  return status.startsWith("enabled") ? "gpu" : /^(disabled|unavailable)/.test(status) ? "software" : "gpu";
}

interface GpuApp {
  getGPUFeatureStatus(): { gpu_compositing?: string };
  on(event: "gpu-info-update", listener: () => void): unknown;
  on(event: "child-process-gone", listener: (e: unknown, details: { type: string }) => void): unknown;
}
/** When the status is read if Chromium never sent its GPU information. */
const LATE_READ_MS = 3000;

/**
 * Follows the compositing: `current()` now, and `onChange` when it changes. Chromium's status is
 * only right once the GPU's information has come in (`gpu-info-update`; before it, even a GPU reads
 * "disabled_software"), so until then it's the GPU, or the override. `log` gets one line with
 * Chromium's status when it's first known, and one more for every change after.
 */
export function watchCompositing(app: GpuApp, override: string | undefined, log?: (line: string) => void) {
  const read = () => {
    try {
      return app.getGPUFeatureStatus().gpu_compositing;
    } catch {
      return undefined;
    }
  };
  let value = compositingFrom(undefined, override);
  let known = false;
  const listeners = new Set<(c: Compositing) => void>();
  const update = () => {
    const status = read();
    const next = compositingFrom(status, override);
    const changed = next !== value;
    if (!known || changed) log?.(`compositing: ${next} (gpu_compositing=${status ?? "unknown"}${override ? `, override=${override}` : ""})`);
    known = true;
    if (!changed) return;
    value = next;
    for (const l of listeners) l(value);
  };
  app.on("gpu-info-update", update);
  app.on("child-process-gone", (_e, details) => {
    if (details.type === "GPU") update();
  });
  // In case no update comes: Chromium's status as it is after a few seconds. (Not getGPUInfo("basic"),
  // which resolves before the GPU's information and still reads "disabled_software" on a GPU.)
  const late = setTimeout(() => known || update(), LATE_READ_MS);
  (late as { unref?: () => void }).unref?.();
  return {
    current: () => value,
    onChange: (l: (c: Compositing) => void) => (listeners.add(l), () => listeners.delete(l)),
  };
}
