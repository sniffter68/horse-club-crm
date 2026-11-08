import { handleCatalogImageError } from '../catalogImage';
import type { PublicService } from '../usePublicContent';
import type { ReactElement } from 'react';
import type { ChooseBooking } from '../booking';
import { landingData } from '../data/landingContent';

// These enquiry formats stay visible even when the CRM catalog contains only disciplines.
const starterServices = landingData.services.slice(0, 3);

export function ServicesSection({ services, onChoose }: { services: PublicService[]; onChoose: ChooseBooking }): ReactElement {
  const visibleServices = [...starterServices, ...services.filter(service =>
    !starterServices.some(starter => starter.id === service.id))];

  return (
    <section aria-labelledby="services-heading" className="bg-club-deep px-6 py-10 text-white sm:px-10 md:py-16 lg:px-16">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center md:mb-8">
          <h2 id="services-heading" className="font-serif text-2xl font-normal leading-tight tracking-tight text-club-sand sm:text-3xl lg:text-4xl">Услуги</h2>
          <span className="text-sm text-club-sand">Начните со знакомства — опыт не требуется</span>
        </div>
        <ul aria-label="Услуги клуба" className="services-carousel flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth p-1 pb-5 motion-reduce:scroll-auto">
          {visibleServices.map(service => (
            <li key={service.id} className="flex min-w-0 shrink-0 basis-[90%] snap-start sm:basis-[calc((100%-1rem)/2.2)] lg:basis-[calc((100%-2rem)/3.2)]">
              <article className="relative flex w-full min-w-0 flex-col rounded-3xl bg-white p-5 text-club-deep transition-colors hover:bg-club-paper md:p-6">
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
                  <button type="button" aria-label={`Записаться: ${service.title}`} aria-haspopup="dialog"
                    onClick={() => onChoose('service', { id: service.id, name: service.title })}
                    className="mt-4 inline-flex min-h-11 w-full cursor-pointer items-center justify-center rounded-xl bg-club-action px-4 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-club-deep active:bg-club-secondary after:absolute after:inset-0 after:rounded-3xl focus-visible:after:outline-2 focus-visible:after:outline-club-action focus-visible:after:outline-offset-4">
                    Выбрать этот формат
                  </button>
                </div>
              </article>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
