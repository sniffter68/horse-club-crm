// Reduce newly uploaded phone photos once, so every landing visitor downloads the smaller file.
export async function optimizeCatalogImage(file: File, signal: AbortSignal): Promise<File> {
  const image = await createImageBitmap(file).catch(() => {
    throw new Error('Не удалось прочитать фото. Выберите другой файл JPG, PNG или WebP.');
  });
  try {
    signal.throwIfAborted();
    const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
    if (scale === 1 && file.size < 256 * 1024) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d');
    if (!context) return file;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', 0.82));
    signal.throwIfAborted();
    return blob && blob.type === 'image/webp' && blob.size < file.size
      ? new File([blob], file.name.replace(/\.[^.]+$/, '') + '.webp', { type: 'image/webp' }) : file;
  } finally { image.close(); }
}
