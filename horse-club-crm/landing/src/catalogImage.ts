import type { SyntheticEvent } from 'react';

export const catalogPlaceholder = '/images/catalog-placeholder.svg';

export function resolveCatalogImage(value: unknown, apiBase = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || '/api'): string {
  const url = typeof value === 'string' ? value.trim() : '';
  if (/^https?:\/\//i.test(url)) return url;
  if (/^\/uploads\/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$/.test(url)) {
    return /^https?:\/\//i.test(apiBase) ? new URL(url, apiBase).href : url;
  }
  return catalogPlaceholder;
}

export function handleCatalogImageError(event: SyntheticEvent<HTMLImageElement>): void {
  const image = event.currentTarget;
  if (image.getAttribute('src') !== catalogPlaceholder) image.src = catalogPlaceholder;
}
