import type { SyntheticEvent } from 'react';

export const catalogPlaceholder = '/images/catalog-placeholder.svg';

export function handleCatalogImageError(event: SyntheticEvent<HTMLImageElement>): void {
  const image = event.currentTarget;
  if (image.getAttribute('src') !== catalogPlaceholder) image.src = catalogPlaceholder;
}
