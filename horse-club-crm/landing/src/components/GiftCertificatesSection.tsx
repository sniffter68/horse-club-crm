import { type ReactElement } from 'react';
import { scrollToBooking } from '../booking';

const benefits = [
  {
    title: 'На любую услугу или сумму',
    description: 'Подарите занятие, прогулку или сертификат на выбранную сумму — получатель сможет выбрать подходящее впечатление.',
  },
  {
    title: 'Бумажный или электронный',
    description: 'Выберите бумажный сертификат для личного вручения или электронный, который удобно отправить близкому человеку.',
  },
  {
    title: 'Срок действия — 6 месяцев',
    description: 'У получателя будет шесть месяцев, чтобы выбрать удобное время для визита и знакомства с лошадьми.',
  },
];

export function GiftCertificatesSection(): ReactElement {
  return (
    <section
      id="gift-certificates"
      aria-labelledby="gift-certificates-heading"
      className="relative overflow-hidden border-t border-black/5 bg-luxury-bg px-6 py-28 text-luxury-dark sm:px-10 lg:px-16"
    >
      <div className="relative mx-auto max-w-7xl">
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
          <h2 id="gift-certificates-heading" className="mt-3 max-w-2xl font-serif text-4xl font-normal tracking-tight text-luxury-dark sm:text-6xl">
            Подарочные сертификаты
          </h2>
          <p className="max-w-md text-xs leading-relaxed text-[#6E645F] sm:text-sm">
            Подарите время рядом с лошадьми — для первого знакомства или нового шага в верховой езде.
          </p>
        </div>

        <ul role="list" className="mt-16 grid grid-cols-1 gap-8 lg:grid-cols-3">
          {benefits.map(benefit => (
            <li key={benefit.title} className="relative flex flex-col rounded-[2.5rem] border border-black/5 bg-white/90 p-8 shadow-[0_15px_35px_rgba(58,47,43,0.04)] backdrop-blur-md sm:p-12">
              <h3 className="mt-2 font-serif text-2xl font-normal leading-snug text-luxury-dark sm:text-3xl">{benefit.title}</h3>
              <p className="mt-4 text-xs leading-relaxed text-[#6E645F] sm:text-sm">{benefit.description}</p>
            </li>
          ))}
        </ul>

        <div className="mt-12 text-center">
          <a
            href="#booking-form"
            onClick={event => { event.preventDefault(); scrollToBooking(); }}
            className="inline-flex rounded-full bg-luxury-dark px-7 py-3.5 text-xs font-semibold uppercase tracking-[0.14em] text-white shadow-sm transition-all hover:scale-105 hover:bg-[#5A483E] active:scale-95"
          >
            Заказать сертификат
          </a>
        </div>
      </div>
    </section>
  );
}
