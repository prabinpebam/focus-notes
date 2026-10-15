/**
 * The drag loop (D-151, PRF-14): while the app-built window is moved or resized, the main process
 * reads the system's cursor itself once a frame of the window's display and applies only its latest
 * position. It's the only timer of the window besides the pointer watches, and it runs only while a
 * drag lasts: started by the drag's start, stopped by its end, by the window hiding or going inactive,
 * or by the window closing (PRF-04: nothing repeats at rest).
 */

/** Runs `fn` every `ms` (a display frame) until the returned function is called. */
export function everyFrame(ms: number, fn: () => void): () => void {
  const loop = setInterval(fn, Math.max(1, ms));
  return () => clearInterval(loop);
}
