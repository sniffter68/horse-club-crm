import React from 'react';
import { money, type Service } from './api';
import { haptic } from './telegram';

const _h = React.createElement;
const serviceTitle = (service: Service): string => service.title || service.name;
const FORMATS = [
  { label: 'Первое знакомство', pattern: /знаком|перв|начал|нович/i },
  { label: 'Пони для детей', pattern: /пони|дет/i },
  { label: 'Прогулка', pattern: /прогул/i },
  { label: 'Индивидуальная тренировка', pattern: /индивиду|трениров|конкур|выезд/i },
];

interface CatalogProps {
  services: Service[]; serviceId?: string; format: string; loading: boolean; error: string;
  onFormat: (format: string) => void; onSelect: (service: Service) => void;
}
export function ClientBookingCatalog({ services, serviceId, format, loading, error, onFormat, onSelect }: CatalogProps) {
  const displayedServices = format ? services.filter(item => FORMATS.find(entry => entry.label === format)?.pattern.test(serviceTitle(item))) : services;
  return <section aria-label="Каталог услуг">
      <p className="hint mb-6">Выберите занятие — и до встречи в седле.</p>
      <div className="formats mb-4" aria-label="Выбор формата">
        {['Все занятия', ...FORMATS.map(entry => entry.label)].map(label => <button key={label} className="quiet"
          aria-pressed={(format || 'Все занятия') === label} onClick={() => { haptic(); onFormat(label === 'Все занятия' ? '' : label);  }}>{label}</button>)}
      </div>
      <div className="stack" aria-label="Форматы занятий">
        {!loading && !error && services.length === 0 && <p className="notice">Запись закрыта. Телефон: <a href="tel:+79156720030">+7 (915) 672-00-30</a>.</p>}
        {!loading && !error && services.length > 0 && displayedServices.length === 0 && <p className="notice">Нет доступных услуг. Выберите «Все занятия».</p>}
        {displayedServices.map(item => <button key={item.id} className="choice service" aria-pressed={serviceId === item.id}
          disabled={loading} onClick={() => { haptic(); onSelect(item); }}>
          <span><strong>{serviceTitle(item)}</strong><span className="hint">{item.durationMinutes} мин</span></span>
          <span className="price">{money(item.price)} <span aria-hidden="true">↗</span></span>
        </button>)}
      </div>
  </section>;
}
