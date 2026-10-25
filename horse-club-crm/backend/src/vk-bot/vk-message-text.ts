/** Leave headroom below VK's message limit without splitting UTF-16 surrogate pairs. */
export function splitVkText(text: string): string[] {
  const limit = 3500;
  const chunks: string[] = [];
  while (text.length > limit) {
    let end = text.lastIndexOf('\n', limit - 1) + 1 || limit;
    const next = text.charCodeAt(end);
    if (next >= 0xdc00 && next <= 0xdfff) end--;
    chunks.push(text.slice(0, end));
    text = text.slice(end);
  }
  if (text || !chunks.length) chunks.push(text);
  return chunks;
}
