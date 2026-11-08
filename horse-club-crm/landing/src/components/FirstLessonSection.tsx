import { Carousel } from './Carousel';
import { type ReactElement } from 'react';

const steps = [
  {
    number: '01', title: 'Обсудите занятие', duration: 'До поездки',
    description: 'Можно честно сказать: «Я боюсь» или «Я никогда не пробовал». Обсудим ваши пожелания и подберём нагрузку, даже если вы не занимались спортом.',
  },
  {
    number: '02', title: 'Прибытие за 15 минут', duration: '15 мин до занятия',
    description: 'Приезжайте заранее, чтобы спокойно освоиться. Шлем и экипировку выдаём бесплатно, подберём размер и объясним простые правила безопасности.',
  },
  {
    number: '03', title: 'Знакомство с лошадью', duration: 'С тренером',
    description: 'Тренер познакомит вас с доброй учебной лошадью, привыкшей к детям и новичкам. Покажет, как подойти и погладить. Угощать можно с его разрешения.',
  },
  {
    number: '04', title: 'Посадка в седло', duration: 'Первый шаг',
    description: 'Поможем сесть в седло. Тренер всё время держит лошадь под уздцы, не оставляя вас одних. Начнём со спокойного шага; к рыси перейдём только когда вы сами будете готовы.',
  },
];

const preparation = [
  { title: 'Одежда', description: 'Обычные удобные штаны или леггинсы, закрывающие ноги. Покупать специальную форму заранее не нужно.' },
  { title: 'Обувь и шлем', description: 'Кроссовки без выраженного протектора подойдут для первого раза. Обувь на гладкой подошве с небольшим каблуком тоже подходит. Шлем подберём на месте бесплатно. Избегайте платформы, высокого каблука и открытой обуви.' },
  { title: 'Лакомство', description: 'По желанию — мытая морковь или яблоки, нарезанные дольками.' },
];

export function FirstLessonSection({ onBookFirstLesson }: { onBookFirstLesson: () => void }): ReactElement {
  return (
    <section
      id="preparation"
      aria-labelledby="first-lesson-heading"
      className="relative overflow-hidden border-t border-black/5 bg-luxury-card px-6 py-10 md:py-16 text-luxury-dark sm:px-10 lg:px-16"
    >
      <div id="first-lesson" className="relative mx-auto max-w-7xl">
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
          <h2 id="first-lesson-heading" className="leading-[1.125] mt-3 max-w-2xl font-serif tracking-tight text-luxury-dark text-2xl sm:text-3xl lg:text-4xl font-normal">
            Первое знакомство — шаг за шагом, вместе с тренером
          </h2>
          <p className="max-w-md text-sm sm:text-base leading-relaxed text-club-secondary">
            Опыт верховой езды не нужен. Мы бережно проведём вас через первое знакомство с лошадью.
          </p>
        </div>

        <div className="mt-6 md:mt-8">
          <Carousel label="Впервые в клубе" ordered>
            {steps.map(step => (
              <article key={step.number} className="relative flex flex-col rounded-[2.5rem] border border-black/5 bg-white/90 p-5 md:p-6 shadow-[0_15px_35px_rgba(58,47,43,0.04)] backdrop-blur-md">
                <div className="flex items-center justify-between gap-4">
                  <span aria-hidden="true" className="font-serif text-3xl font-light text-luxury-brown/70">{step.number}</span>
                  <span className="rounded-full border border-black/5 bg-luxury-card px-3.5 py-1 text-sm font-semibold text-club-secondary">{step.duration}</span>
                </div>
                <div className="mt-6">
                  <h3 className="mt-2 font-serif leading-snug text-luxury-dark text-lg sm:text-xl font-semibold">{step.title}</h3>
                  <p className="mt-4 text-sm sm:text-base leading-relaxed text-club-secondary">{step.description}</p>
                </div>
              </article>
            ))}
          </Carousel>
        </div>

        <div className="mt-6 md:mt-8 rounded-[2.2rem] border border-black/5 bg-luxury-bg/50 p-5 md:p-6 backdrop-blur-sm">
          <h3 className="font-serif text-luxury-dark text-lg sm:text-xl font-semibold">Что надеть и как подготовиться</h3>
          <dl className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
            {preparation.map(item => (
              <div key={item.title}>
                <dt className="text-sm font-semibold text-luxury-brown">{item.title}</dt>
                <dd className="mt-2 text-sm leading-relaxed text-club-secondary sm:text-sm">{item.description}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="mt-6 md:mt-8 text-center">
          <a
            href="#booking"
            onClick={event => { event.preventDefault(); onBookFirstLesson(); }}
            className="inline-flex rounded-full bg-luxury-dark px-7 py-3.5 text-sm font-semibold text-white shadow-sm transition-all hover:scale-105 hover:bg-club-secondary active:scale-95"
          >
            Попробовать первое занятие
          </a>
        </div>
      </div>
    </section>
  );
}
