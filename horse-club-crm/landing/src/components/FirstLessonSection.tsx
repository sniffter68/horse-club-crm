import { type ReactElement } from 'react';
import { scrollToBooking } from '../booking';

const steps = [
  {
    number: '01', title: 'Встреча и экипировка', duration: '10 мин',
    description: 'Подбираем бесплатный защитный шлем по размеру и за 5 минут объясняем простые правила общения с лошадью.',
  },
  {
    number: '02', title: 'Знакомство с лошадью', duration: '10 мин',
    description: 'Подбираем самую спокойную и дружелюбную лошадь. Вы погладите её, привыкнете к габаритам и угостите морковкой.',
  },
  {
    number: '03', title: 'Посадка и шаг с тренером', duration: '20 мин',
    description: 'Помогаем мягко сесть в седло. Тренер идёт рядом и держит лошадь на страховочной корде — она не побежит и не сделает резких движений.',
  },
  {
    number: '04', title: 'Самостоятельный шаг и фото', duration: '20 мин',
    description: 'Когда вы почувствуете уверенность, научим базовым командам поводьями и сделаем атмосферные кадры на ваш смартфон.',
  },
];

const preparation = [
  { title: 'Одежда', description: 'Длинные удобные брюки или плотные спортивные штаны (не шорты).' },
  { title: 'Обувь', description: 'Закрытые кроссовки или ботинки на плоской подошве.' },
  { title: 'Лакомство', description: 'По желанию — мытая морковь или яблоки, нарезанные дольками.' },
];

export function FirstLessonSection(): ReactElement {
  return (
    <section
      id="first-lesson"
      aria-labelledby="first-lesson-heading"
      className="relative overflow-hidden border-t border-black/5 bg-luxury-card px-6 py-10 md:py-16 text-luxury-dark sm:px-10 lg:px-16"
    >
      <div className="relative mx-auto max-w-7xl">
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
          <h2 id="first-lesson-heading" className="mt-3 max-w-2xl font-serif text-4xl font-normal tracking-tight text-luxury-dark sm:text-6xl">
            Впервые в седле? Это проще и безопаснее, чем кажется
          </h2>
          <p className="max-w-md text-xs leading-relaxed text-[#6E645F] sm:text-sm">
            70% наших гостей приходят без опыта верховой езды. Мы бережно проведём вас через каждое мгновение первого знакомства с лошадью.
          </p>
        </div>

        <ol role="list" className="mt-6 md:mt-8 grid grid-cols-1 gap-8 lg:grid-cols-2">
          {steps.map(step => (
            <li key={step.number} className="relative flex flex-col rounded-[2.5rem] border border-black/5 bg-white/90 p-8 shadow-[0_15px_35px_rgba(58,47,43,0.04)] backdrop-blur-md sm:p-12">
              <div className="flex items-center justify-between gap-4">
                <span aria-hidden="true" className="font-serif text-3xl font-light text-luxury-brown/70">{step.number}</span>
                <span className="rounded-full border border-black/5 bg-luxury-card px-3.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5A483E]">{step.duration}</span>
              </div>
              <div className="mt-8">
                <h3 className="mt-2 font-serif text-2xl font-normal leading-snug text-luxury-dark sm:text-3xl">{step.title}</h3>
                <p className="mt-4 text-xs leading-relaxed text-[#6E645F] sm:text-sm">{step.description}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-6 md:mt-8 rounded-[2.2rem] border border-black/5 bg-luxury-bg/50 p-8 backdrop-blur-sm sm:p-10">
          <h3 className="font-serif text-xl font-normal text-luxury-dark sm:text-2xl">Как подготовиться к визиту</h3>
          <dl className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
            {preparation.map(item => (
              <div key={item.title}>
                <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-luxury-brown">{item.title}</dt>
                <dd className="mt-2 text-xs leading-relaxed text-[#6E645F] sm:text-sm">{item.description}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="mt-6 md:mt-8 text-center">
          <a
            href="#booking-form"
            onClick={event => { event.preventDefault(); scrollToBooking(); }}
            className="inline-flex rounded-full bg-luxury-dark px-7 py-3.5 text-xs font-semibold uppercase tracking-[0.14em] text-white shadow-sm transition-all hover:scale-105 hover:bg-[#5A483E] active:scale-95"
          >
            Записаться на первое занятие
          </a>
        </div>
      </div>
    </section>
  );
}
