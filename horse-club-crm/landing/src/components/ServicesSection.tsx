import { handleCatalogImageError } from '../catalogImage';
import type { PublicService } from '../usePublicContent';
import type { ReactElement } from 'react';
import type { ChooseBooking } from '../booking';

export function ServicesSection({ services, onChoose }: { services: PublicService[]; onChoose: ChooseBooking }): ReactElement {
  if (services.length === 0) return <></>;

  return (
    <section id="services" className="bg-club-deep px-6 py-10 text-white sm:px-10 md:py-16 lg:px-16">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center md:mb-8">
          <h2 className="font-serif text-2xl font-normal leading-tight tracking-tight text-club-sand sm:text-3xl lg:text-4xl">Услуги</h2>
          <span className="text-sm text-club-sand">Направления обучения</span>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {services.map(service => (
            <article key={service.id} className="flex min-w-0 flex-col rounded-3xl bg-white p-5 text-club-deep md:p-6">
              <div className="mb-4 flex items-center gap-3">
                <img src={service.imageUrl} alt="" loading="lazy" decoding="async" onError={handleCatalogImageError}
                  width={64} height={64} className="h-16 w-16 shrink-0 rounded-xl object-contain" />
                <span className="rounded-full bg-club-sand/60 px-3 py-1 text-sm font-semibold text-club-secondary">{service.category}</span>
              </div>
              <h3 className="font-serif text-lg font-semibold leading-snug sm:text-xl">{service.title}</h3>
              <p className="mt-2 max-w-prose text-sm leading-relaxed text-club-secondary sm:text-base">{service.description}</p>
              <div className="mt-auto pt-4">
                <p className="text-lg font-semibold sm:text-xl">{service.price}</p>
                <p className="mt-1 text-sm leading-relaxed text-club-secondary">
                  {service.durationMinutes ? `Длительность: ${service.durationMinutes} минут` : 'Длительность: по согласованию'}
                  {' · '}{service.format || 'Формат: по согласованию'}
                </p>
                <a href="#booking-form"
                  onClick={event => { event.preventDefault(); onChoose('service', { id: service.id, name: service.title }); }}
                  className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-club-action px-4 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-club-deep active:bg-club-secondary">
                  Записаться на занятие
                </a>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
