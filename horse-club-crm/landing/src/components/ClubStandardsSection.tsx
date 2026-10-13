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
    number: '01',
    category: 'Амортизация и грунт',
    title: 'Еврогрунт с немецким геотекстилем',
    description:
      'Специально подготовленная смесь кварцевого песка и синтетических волокон с регулярным боронованием и обеспыливанием. Обеспечивает бережную амортизацию и снижает ударную нагрузку на связки и суставы до 40%.',
    metricLabel: 'Крытый манеж',
    metricValue: '1 800 м²',
    tag: 'Защита суставов',
  },
  {
    number: '02',
    category: 'Методика обучения',
    title: 'Классическая европейская школа',
    description:
      'Мы придерживаемся принципов бережного партнерства: тонкая работа со средствами управления, баланс посадки и психология лошади. Никакого форсирования нагрузок — только осознанный прогресс шаг за шагом.',
    metricLabel: 'Опыт наставников',
    metricValue: 'до 14 лет',
    tag: 'Гуманный подход',
  },
  {
    number: '03',
    category: 'Условия постоя',
    title: 'Пространство и микроклимат денников',
    description:
      'Каждый денник оборудован приточной вентиляцией, естественным освещением, автопоилками с подогревом и резиновым бесшовным покрытием. Ежедневный выгул в левадах и 4-разовое сбалансированное питание.',
    metricLabel: 'Размер денника',
    metricValue: '3 × 4 м',
    tag: 'Премиум-постой',
  },
  {
    number: '04',
    category: 'Безопасность гостей',
    title: 'Протокол нулевого риска',
    description:
      'Клубная экипировка европейской сертификации CE/VG1, закрытая охраняемая территория, раздельные зоны разминки и турнирного конкура. Профессиональная аптечка и круглосуточный ветеринарный контроль.',
    metricLabel: 'Контроль здоровья',
    metricValue: '24 / 7',
    tag: 'Сертификация CE',
  },
];

export function ClubStandardsSection(): ReactElement {
  return (
    <section
      id="about"
      className="relative overflow-hidden bg-[#FAF7F2] px-6 py-28 text-[#3A2F2B] sm:px-10 lg:px-16 border-t border-black/5"
    >
      {/* Декоративный теплый фон */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-40 top-1/3 h-[500px] w-[500px] rounded-full bg-[#E4DAD0]/50 blur-3xl"
      />

      <div className="relative mx-auto max-w-7xl">
        {/* Заголовок секции */}
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[#724C39]">
              Философия и качество
            </span>
            <h2 className="mt-3 font-serif text-4xl font-normal tracking-tight text-[#3A2F2B] sm:text-6xl">
              Стандарты клуба
            </h2>
          </div>
          <p className="max-w-md text-xs sm:text-sm leading-relaxed text-[#6E645F]">
            Безупречная среда для лошадей турнирного класса и всадников, ценящих приватность, комфорт и безопасность высочайшего уровня.
          </p>
        </div>

        {/* Сетка стандартов */}
        <div className="mt-16 grid grid-cols-1 gap-8 md:grid-cols-2">
          {standards.map((item, index) => (
            <motion.div
              key={item.number}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="group relative flex flex-col justify-between overflow-hidden rounded-[2.5rem] border border-black/5 bg-white/90 p-8 sm:p-12 shadow-[0_15px_35px_rgba(58,47,43,0.04)] backdrop-blur-md transition-all duration-500 hover:-translate-y-1.5 hover:shadow-[0_25px_50px_rgba(58,47,43,0.08)]"
            >
              <div>
                {/* Верхняя строка карточки */}
                <div className="flex items-center justify-between">
                  <span className="font-serif text-3xl font-light text-[#724C39]/70">
                    {item.number}
                  </span>
                  <span className="rounded-full bg-[#FAF7F2] border border-black/5 px-3.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5A483E]">
                    {item.tag}
                  </span>
                </div>

                <div className="mt-8">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8C7E77]">
                    {item.category}
                  </span>
                  <h3 className="mt-2 font-serif text-2xl sm:text-3xl font-normal leading-snug text-[#3A2F2B]">
                    {item.title}
                  </h3>
                  <p className="mt-4 text-xs sm:text-sm leading-relaxed text-[#6E645F]">
                    {item.description}
                  </p>
                </div>
              </div>

              {/* Нижняя метрика */}
              <div className="mt-10 flex items-baseline justify-between border-t border-black/5 pt-6">
                <span className="text-xs uppercase tracking-wider text-[#8C7E77]">
                  {item.metricLabel}
                </span>
                <span className="font-serif text-2xl sm:text-3xl font-light text-[#3A2F2B]">
                  {item.metricValue}
                </span>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Нижняя инфо-плашка с цитатой клуба */}
        <div className="mt-12 rounded-[2.2rem] border border-black/5 bg-[#E4DAD0]/50 p-8 sm:p-10 backdrop-blur-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="max-w-2xl">
            <h4 className="font-serif text-xl sm:text-2xl font-normal text-[#3A2F2B]">
              «Лошадь — не спортивный инвентарь, а равноправный партнер»
            </h4>
            <p className="mt-2 text-xs text-[#6E645F] leading-relaxed">
              Каждое решение в обустройстве конноспортивного клуба СЛКС Тамбов принималось с позиции биомеханики, физиологии и психологии лошадей.
            </p>
          </div>
          <a
            href="#contacts"
            className="shrink-0 rounded-full bg-[#3A2F2B] px-7 py-3.5 text-xs font-semibold uppercase tracking-[0.14em] text-white shadow-sm transition-all hover:bg-[#5A483E] hover:scale-105 active:scale-95"
          >
            Приехать на экскурсию ↗
          </a>
        </div>
      </div>
    </section>
  );
}