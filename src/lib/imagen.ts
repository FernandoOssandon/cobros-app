// Achica una foto (boleta) antes de guardarla, para no llenar el teléfono.
export async function achicarImagen(file: Blob, max = 1600, calidad = 0.8): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (k === 1 && file.size < 600_000) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * k);
    canvas.height = Math.round(bmp.height * k);
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((res) => canvas.toBlob((b) => res(b ?? file), 'image/jpeg', calidad));
  } catch {
    return file;
  }
}
