import { useState } from 'react';
import type { PublicService } from '../usePublicContent';
import type { ChooseBooking } from '../booking';
import { CatalogBadges, CatalogPhoto } from './CatalogPhoto';

export function ServicesSection({ services, onChoose }: { services: PublicService[]; onChoose: ChooseBooking }) {
  const [activeId, setActiveId] = useState('');
  const [expandedId, setExpandedId] = useState('');
  const current = services.find(item => item.id === activeId) ?? services[0];
  if (!current) return null;
  return <section id="services" className="bg-[#241E1C] px-4 py-20 text-white sm:px-10 sm:py-28 lg:px-16" aria-labelledby="services-heading">
    <div className="mx-auto max-w-7xl">
      <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
        <h2 id="services-heading" className="font-serif text-4xl font-normal tracking-tight text-[#E4DAD0] sm:text-6xl">Услуги</h2>
        <p className="text-sm text-[#BFB1A6]">Найдите своё направление</p>
      </div>
      <div className="grid min-w-0 gap-8 lg:grid-cols-12 lg:gap-12">
        <div className="service-options lg:col-span-5" role="group" aria-label="Услуги клуба">
          {services.map(item => <button key={item.id} type="button" aria-pressed={item.id === current.id}
            onClick={() => { setActiveId(item.id); setExpandedId(''); }}>
            <span>{item.title}</span><span aria-hidden="true">→</span>
          </button>)}
        </div>
        <article className="catalog-card service-card lg:col-span-7" aria-labelledby="service-title">
          <CatalogPhoto src={current.imageUrl} alt={current.title} />
          <div className="catalog-body">
            <CatalogBadges labels={[current.category]} />
            <h3 id="service-title" className="catalog-title">{current.title}</h3>
            <p id="service-description" className={expandedId === current.id ? 'catalog-description' : 'catalog-description line-clamp-4'}>{current.description}</p>
            {current.description.length > 180 && <button type="button" className="catalog-details"
              aria-expanded={expandedId === current.id} aria-controls="service-description"
              onClick={() => setExpandedId(expandedId === current.id ? '' : current.id)}>
              {expandedId === current.id ? 'Свернуть описание' : 'Читать описание полностью'}
            </button>}
            <div className="catalog-bottom">
              <div><span className="block text-sm text-[#6E645F]">Стоимость</span>
                <p className="catalog-price">{current.price}</p>
                {current.durationMinutes && <p className="mt-1 text-sm text-[#6E645F]">{current.durationMinutes} мин</p>}
              </div>
              <button type="button" className="catalog-cta" onClick={() => onChoose('service', { id: current.id, name: current.title })}>Записаться на занятие</button>
            </div>
          </div>
        </article>
      </div>
    </div>
  </section>;
}
