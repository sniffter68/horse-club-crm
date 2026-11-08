import { otherServices, type ChooseBooking } from '../booking';
import { Carousel } from './Carousel';
import { type ReactElement } from 'react';
import { motion } from 'framer-motion';

interface StandardItem {
  number: string;
  category: string;
  title: string;
  description: string;
  metricLabel: string;
  metricValue: string;
  tag: string;
}

const standards: StandardItem[] = [
  {
    number: '01', category: 'Поддержка', title: 'Лошадь держит тренер',
    description: 'Новичка не оставляем одного ни на секунду. Тренер всё время держит лошадь под уздцы, объясняет, что делать, и помогает почувствовать себя увереннее.',
    metricLabel: 'На первом занятии', metricValue: 'Всегда рядом', tag: 'Вы не одни',
  },
  {
    number: '02', category: 'Экипировка', title: 'Шлем и экипировку выдаём бесплатно',
    description: 'Ничего покупать заранее не нужно. Подберём шлем по размеру, поможем надеть и проверим посадку перед занятием.',
    metricLabel: 'Для первого визита', metricValue: 'Всё подберём', tag: 'Без лишних покупок',
  },
  {
    number: '03', category: 'Ваш темп', title: 'Занятия в спокойном шаговом ритме',
    description: 'Первый урок — знакомство и спокойная прогулка. Никакой спешки: переходим на рысь только когда всадник сам готов. Можно остановиться и сделать паузу.',
    metricLabel: 'Начинаем', metricValue: 'Со шага', tag: 'Без спешки',
  },
  {
    number: '04', category: 'Знакомство', title: 'Специально обученные, добрые лошади',
    description: 'Учебные лошади проходят отбор по характеру и привыкли к детям и первым шагам. Тренер покажет, как подойти, погладить и предложить угощение.',
    metricLabel: 'Основа общения', metricValue: 'Доверие', tag: 'Привыкли к новичкам',
  },
];

export function ClubStandardsSection({ onChoose }: { onChoose: ChooseBooking }): ReactElement {
  return (
    <section
      id="about"
      className="relative overflow-hidden bg-club-paper px-6 py-10 md:py-16 text-club-ink sm:px-10 lg:px-16 border-t border-black/5"
    >
      {/* Декоративный теплый фон */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-40 top-1/3 h-[500px] w-[500px] rounded-full bg-club-sand/50 blur-3xl"
      />

      <div className="relative mx-auto max-w-7xl">
        {/* Заголовок секции */}
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
          <div>
            <span className="text-sm font-semibold text-club-action">
              Первый раз в клубе
            </span>
            <h2 className="leading-[1.125] mt-3 font-serif tracking-tight text-club-ink text-2xl sm:text-3xl lg:text-4xl font-normal">
              С заботой о вашем спокойствии
            </h2>
          </div>
          <p className="max-w-md text-sm sm:text-base leading-relaxed text-club-secondary">
            Волноваться перед первым занятием нормально. Расскажите нам о своих опасениях — познакомимся с лошадьми в удобном для вас темпе.
          </p>
        </div>

        {/* Карусель стандартов */}
        <div className="mt-6 md:mt-8">
          <Carousel label="С заботой о вашем спокойствии">
            {standards.map((item, index) => (
              <motion.div
                key={item.number}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="group relative flex flex-col justify-between overflow-hidden rounded-[2.5rem] border border-black/5 bg-white/90 p-5 md:p-6 shadow-[0_15px_35px_rgba(58,47,43,0.04)] backdrop-blur-md transition-all duration-500 hover:-translate-y-1.5 hover:shadow-[0_25px_50px_rgba(58,47,43,0.08)]"
              >
                <div>
                  {/* Верхняя строка карточки */}
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <span className="font-serif text-3xl font-light text-club-action/70">
                      {item.number}
                    </span>
                    <span className="rounded-full bg-club-paper border border-black/5 px-3.5 py-1 text-sm font-semibold text-club-secondary">
                      {item.tag}
                    </span>
                  </div>

                  <div className="mt-6">
                    <span className="text-sm font-semibold text-club-secondary">
                      {item.category}
                    </span>
                    <h3 className="mt-2 font-serif leading-snug text-club-ink text-lg sm:text-xl font-semibold">
                      {item.title}
                    </h3>
                    <p className="mt-4 text-sm sm:text-base leading-relaxed text-club-secondary">
                      {item.description}
                    </p>
                  </div>
                </div>

                {/* Нижняя метрика */}
                <div className="mt-6 flex items-baseline justify-between gap-3 flex-wrap border-t border-black/5 pt-6">
                  <span className="text-sm text-club-secondary">
                    {item.metricLabel}
                  </span>
                  <span className="font-serif text-2xl sm:text-3xl font-light text-club-ink">
                    {item.metricValue}
                  </span>
                </div>
              </motion.div>
            ))}
          </Carousel>
        </div>

        {/* Нижняя инфо-плашка с цитатой клуба */}
        <div className="mt-6 md:mt-8 rounded-[2.2rem] border border-black/5 bg-club-sand/50 p-5 md:p-6  backdrop-blur-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="max-w-2xl">
            <h4 className="font-serif text-xl sm:text-2xl font-normal text-club-ink">
              Можно начать просто с общения
            </h4>
            <p className="mt-2 text-sm sm:text-base text-club-secondary leading-relaxed">
              Приезжайте всей семьёй: погладим лошадь, угостим морковкой с разрешения тренера и сделаем фото. Садиться в седло сразу необязательно.
            </p>
          </div>
          <a
            href="#booking"
            onClick={event => { event.preventDefault(); onChoose('service', otherServices[3]); }}
            className="shrink-0 rounded-full bg-club-ink px-7 py-3.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-club-secondary hover:scale-105 active:scale-95"
          >
            Приехать на экскурсию ↗
          </a>
        </div>
      </div>
    </section>
  );
}
