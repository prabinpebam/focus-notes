/** Wait for the print snapshot, never the editor's images or an external address. */
export async function preparePrintImages(): Promise<void> {
  const images = [...document.querySelectorAll<HTMLImageElement>("[data-print-root] [data-print-image] img")];
  const failed: HTMLImageElement[] = [];
  await Promise.all(images.map(async image => {
    try {
      await image.decode();
    } catch {
      console.error("Print image could not be decoded");
      failed.push(image);
      image.dispatchEvent(new Event("error"));
    }
  }));
  if (failed.length) {
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    if (failed.some(image => image.isConnected)) throw new Error("Print image description did not replace unavailable pixels");
  }
}
