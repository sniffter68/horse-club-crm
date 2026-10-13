import { handleCatalogImageError } from '../catalogImage';

export function CatalogPhoto({ src, alt }: { src: string; alt: string }) {
  return <div className="catalog-photo">
    <img src={src} alt={alt} width={800} height={600} loading="lazy" decoding="async"
      onError={handleCatalogImageError} />
  </div>;
}

export function CatalogBadges({ labels, full = false }: { labels: string[]; full?: boolean }) {
  const unique = [...new Set(labels.filter(Boolean))];
  return unique.length ? <ul className={full ? 'catalog-badges full' : 'catalog-badges'} aria-label="Характеристики">
    {unique.map(label => <li key={label}>{label}</li>)}
  </ul> : null;
}
