export async function prepareImageCaption(data: string, edge: number, limit: number): Promise<string> {
  if (!/^data:image\/(png|jpeg|webp);base64,/.test(data) || !Number.isInteger(edge) || edge < 1 || !Number.isInteger(limit) || limit < 1) throw new Error("invalid-image");
  const image = new Image();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    image.src = data;
    await Promise.race([image.decode(), new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("invalid-image")), 10000); })]);
    let scale = Math.min(1, edge / image.naturalWidth, edge / image.naturalHeight);
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("image-render-failed");
    for (;;) {
      canvas.width = Math.max(1, Math.floor(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.floor(image.naturalHeight * scale));
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const result = canvas.toDataURL("image/png");
      if ((result.length - result.indexOf(",") - 1) * 3 / 4 <= limit) return result;
      if (canvas.width === 1 && canvas.height === 1) throw new Error("image-too-large");
      scale *= 0.75;
    }
  } finally {
    if (timeout) clearTimeout(timeout);
    image.src = "";
  }
}
