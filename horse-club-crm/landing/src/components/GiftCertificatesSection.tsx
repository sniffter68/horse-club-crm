import { type ReactElement } from 'react';
import { useState } from 'react';
import type { ChooseBooking } from '../booking';

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

export function GiftCertificatesSection({ onChoose }: { onChoose: ChooseBooking }): ReactElement {
  const [amount, setAmount] = useState('2000');
  return (
    <section
      id="gift-certificates"
      aria-labelledby="gift-certificates-heading"
      className="relative overflow-hidden border-t border-black/5 bg-luxury-bg px-6 py-10 md:py-16 text-luxury-dark sm:px-10 lg:px-16"
    >
      <div className="relative mx-auto max-w-7xl">
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
          <h2 id="gift-certificates-heading" className="leading-[1.125] mt-3 max-w-2xl font-serif tracking-tight text-luxury-dark text-2xl sm:text-3xl lg:text-4xl font-normal">
            Подарочные сертификаты
          </h2>
          <p className="max-w-md text-sm sm:text-base leading-relaxed text-club-secondary">
            Подарите время рядом с лошадьми — для первого знакомства или нового шага в верховой езде.
          </p>
        </div>

        <ul role="list" className="mt-6 md:mt-8 grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-3">
          {benefits.map(benefit => (
            <li key={benefit.title} className="relative flex flex-col rounded-[2.5rem] border border-black/5 bg-white/90 p-5 md:p-6 shadow-[0_15px_35px_rgba(58,47,43,0.04)] backdrop-blur-md">
              <h3 className="mt-2 font-serif leading-snug text-luxury-dark text-lg sm:text-xl font-semibold">{benefit.title}</h3>
              <p className="mt-4 text-sm sm:text-base leading-relaxed text-club-secondary">{benefit.description}</p>
            </li>
          ))}
        </ul>

        <div className="mx-auto mt-6 max-w-2xl text-center md:mt-8">
          <label htmlFor="gift-amount" className="mb-2 block font-semibold">Желаемый номинал</label>
          <select id="gift-amount" value={amount} onChange={event => setAmount(event.target.value)}
            className="mb-3 min-h-11 rounded-xl border border-black/20 bg-white px-4 py-3">
            <option value="2000">2 000 ₽</option>
            <option value="4000">4 000 ₽</option>
            <option value="6000">6 000 ₽</option>
          </select>
          <p className="mb-4 text-sm text-club-secondary">Стоимость равна номиналу. Доступность номинала и способ оплаты подтвердит администратор.</p>
          <a
            href="#booking-form"
            onClick={event => { event.preventDefault(); onChoose('service', { id: 'gift-certificate', name: `Подарочный сертификат на ${Number(amount).toLocaleString('ru-RU')} ₽` }); }}
            className="inline-flex rounded-full bg-luxury-dark px-7 py-3.5 text-sm font-semibold text-white shadow-sm transition-all hover:scale-105 hover:bg-club-secondary active:scale-95"
          >
            Купить сертификат
          </a>
        </div>
      </div>
    </section>
  );
}
