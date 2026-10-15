import { useEffect, useState } from 'react';
import { resolveCatalogImage } from './catalogImage';
import { catalogLabel, formatPrice } from './catalogFormat';
import { API_BASE } from './apiBase';
import { landingData, type HorseCard, type TrainerCard, type ServiceItem } from './data/landingContent';

export interface PublicHorse extends HorseCard { description: string }
export interface PublicTrainer extends TrainerCard { description: string; qualification: string; specializations: string[] }
export interface PublicService extends ServiceItem { durationMinutes?: number }
export interface PublicContent { horses: PublicHorse[]; trainers: PublicTrainer[]; services: PublicService[] }

export const fallbackContent: PublicContent = {
  horses: landingData.horses.map(item => ({ ...item, description: '' })),
  trainers: landingData.trainers.map(item => ({ ...item, description: '', qualification: '', specializations: [] })),
  services: landingData.services,
};

type Row = Record<string, unknown>;
function rows(value: unknown): Row[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Row => item !== null && typeof item === 'object'
    && typeof item.id === 'string' && !!item.id && typeof item.name === 'string' && !!item.name.trim());
}
function text(value: unknown): string { return typeof value === 'string' ? value.trim() : ''; }
function photo(value: unknown): string {
  return resolveCatalogImage(value, API_BASE);
}

export function parsePublicContent(value: unknown): PublicContent {
  if (!value || typeof value !== 'object') return fallbackContent;
  const data = value as Row;
  const horses = rows(data.horses).map(item => ({
    id: text(item.id), name: text(item.name), breed: text(item.breed),
    role: catalogLabel(item.role) || catalogLabel(item.riderLevel), description: text(item.description), imageUrl: photo(item.imageUrl),
  }));
  const trainers = rows(data.trainers).map(item => ({
    id: text(item.id), name: text(item.name), role: catalogLabel(item.role), experience: '',
    description: text(item.description), qualification: catalogLabel(item.qualification), imageUrl: photo(item.imageUrl),
    specializations: Array.isArray(item.specializations) ? item.specializations.map(catalogLabel).filter(Boolean) : [],
  }));
  const services = rows(data.services).map(item => {
    return {
      id: text(item.id), title: text(item.title) || text(item.name), category: catalogLabel(item.role),
      price: formatPrice(item.price),
      description: text(item.description), imageUrl: photo(item.imageUrl),
      durationMinutes: typeof item.durationMinutes === 'number' && Number.isFinite(item.durationMinutes) && item.durationMinutes > 0 ? Math.round(item.durationMinutes) : undefined,
    };
  });
  return {
    horses: horses.length ? horses : fallbackContent.horses,
    trainers: trainers.length ? trainers : fallbackContent.trainers,
    services: services.length ? services : fallbackContent.services,
  };
}

export function usePublicContent(): PublicContent {
  const [content, setContent] = useState(fallbackContent);
  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    void fetch(`${API_BASE}/public/content`, { signal: controller.signal, credentials: 'omit' })
      .then(response => { if (!response.ok) throw new Error('Content unavailable'); return response.json() as Promise<unknown>; })
      .then(data => { if (!controller.signal.aborted) setContent(parsePublicContent(data)); })
      .catch(() => { /* Keep the default content on network, timeout or JSON errors. */ })
      .finally(() => window.clearTimeout(timeout));
    return () => { controller.abort(); window.clearTimeout(timeout); };
  }, []);
  return content;
}
