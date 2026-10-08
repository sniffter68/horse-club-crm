import { useState, type ReactElement } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ServiceItem {
  id: string;
  title: string;
  cardTitle: string;
  desc: string;
  price: string;
  duration: string;
  image: string;
  badge: string;
}

const servicesData: ServiceItem[] = [
  {
    id: 'dressage',
    title: 'Выездка',
    cardTitle: 'Индивидуальные занятия по выездке',
    desc: 'Выездка — высшая школа верховой езды и настоящее искусство управления лошадью. Отработка правильной посадки, баланса, средств управления и элементов манежной езды под руководством опытного наставника.',
    price: '3 500 ₽',
    duration: 'Длительность: 50 минут',
    image: '/images/services/dressage.png',
    badge: 'Олимпийский класс',
  },
  {
    id: 'jumping',
    title: 'Конкур',
    cardTitle: 'Тренировки по преодолению препятствий',
    desc: 'Динамичная и зрелищная дисциплина. Обучение расчету темпа, технике прыжка, правильному прохождению маршрутов разной сложности на подготовленных турнирных лошадях.',
    price: '4 000 ₽',
    duration: 'Длительность: 60 минут',
    image: '/images/services/jumping.png',
    badge: 'Спортивный профиль',
  },
  {
    id: 'trail',
    title: 'Прогулки',
    cardTitle: 'Конные маршруты на природе',
    desc: 'Спокойный отдых верхом по живописным маршрутам Тамбовской области. Идеальный вариант для перезагрузки, знакомства с лошадьми и романтических свиданий.',
    price: '2 800 ₽',
    duration: 'Длительность: 1.5 часа',
    image: '/images/services/trail.png',
    badge: 'Для любого уровня',
  },
  {
    id: 'photo',
    title: 'Фотосессии',
    cardTitle: 'Аренда лошадей для съемок',
    desc: 'Создайте памятные кадры с грациозными лошадьми клуба. Предоставляем спокойных, ухоженных лошадей, ассистента и доступ к живописным локациям комплекса.',
    price: '3 000 ₽',
    duration: 'Длительность: 1 час',
    image: '/images/services/photo.png',
    badge: 'Стилизованные съемки',
  },
];

export function ServicesSection(): ReactElement {
  const [activeTab, setActiveTab] = useState<string>(servicesData[0].id);
  const currentService = servicesData.find((s) => s.id === activeTab) || servicesData[0];

  return (
    <section id="services" className="relative overflow-hidden bg-[#241E1C] px-4 py-20 text-white sm:px-10 sm:py-28 lg:px-16">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-32 -left-32 h-[500px] w-[500px] rounded-full bg-[#724C39]/20 blur-3xl"
      />

      <div className="relative mx-auto max-w-7xl">
        <div className="mb-10 flex flex-col items-start justify-between gap-3 sm:mb-14 sm:flex-row sm:items-center">
          <h2 className="font-serif text-4xl sm:text-6xl font-normal tracking-tight text-[#E4DAD0]">
            Услуги
          </h2>
          <span className="text-xs uppercase tracking-[0.2em] text-[#A6988E]">
            Направления обучения
          </span>
        </div>

        <div className="grid grid-cols-1 items-start gap-9 lg:grid-cols-12 lg:gap-12">
          {/* Левая колонка */}
          <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-2 sm:-mx-10 sm:px-10 lg:mx-0 lg:col-span-5 lg:flex-col lg:gap-3 lg:overflow-visible lg:px-0 lg:pb-0">
            {servicesData.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  type="button"
                  className={`group relative flex shrink-0 snap-start items-center justify-between rounded-full px-5 py-3 text-left transition-all duration-300 lg:w-full lg:rounded-2xl lg:px-7 lg:py-5 ${
                    isActive
                      ? 'border border-white/20 bg-white/10 text-white shadow-lg backdrop-blur-md'
                      : 'text-[#8C7E77] hover:text-[#E4DAD0] hover:bg-white/5'
                  }`}
                >
                  <span className="text-sm font-medium tracking-tight transition-transform duration-300 group-hover:translate-x-1 lg:text-3xl lg:font-light">
                    {item.title}
                  </span>

                  {isActive && (
                    <motion.div
                      layoutId="active-indicator"
                      className="ml-3 flex h-6 w-6 items-center justify-center rounded-full bg-[#E4DAD0] text-xs font-bold text-[#241E1C] lg:h-7 lg:w-7 lg:text-sm"
                    >
                      →
                    </motion.div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Правая колонка с карточкой */}
          <div className="relative pt-2 sm:pt-6 lg:col-span-7">
            {/* Парящий конный предмет */}
            <div className="pointer-events-none absolute right-2 top-3 z-20 h-28 w-28 sm:-right-3 sm:-top-8 sm:h-48 sm:w-48 lg:-right-10 lg:-top-20 lg:h-72 lg:w-72">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentService.id}
                  initial={{ opacity: 0, y: 25, scale: 0.85, rotate: -6 }}
                  animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
                  exit={{ opacity: 0, y: -20, scale: 0.88, rotate: 6 }}
                  transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                  className="h-full w-full"
                >
                  <motion.div
                    animate={{
                      y: [0, -8, 0],
                      rotate: [0, 2, -1.5, 0],
                    }}
                    transition={{
                      duration: 4.8,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    }}
                    className="flex h-full w-full items-center justify-center"
                  >
                    <img
                      src={currentService.image}
                      alt={currentService.title}
                      className="h-full w-full object-contain drop-shadow-[0_20px_25px_rgba(0,0,0,0.45)]"
                    />
                  </motion.div>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Карточка с зафиксированной минимальной высотой min-h */}
            <div className="relative z-10 flex min-h-[500px] flex-col justify-between rounded-[2rem] bg-white p-6 text-[#241E1C] shadow-2xl sm:rounded-[2.8rem] sm:p-12">
              <div className="min-h-[19rem] sm:min-h-[18rem]">
                <div className="inline-block rounded-full bg-[#E4DAD0]/60 px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#5A483E] mb-6">
                  {currentService.badge}
                </div>

                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentService.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.3 }}
                  >
                    {/* Фиксированная минимальная высота для заголовка */}
                    <div className="flex min-h-[92px] items-start pr-24 sm:min-h-[108px] sm:pr-36 lg:min-h-[84px] lg:pr-28">
                      <h3 className="font-serif text-2xl sm:text-4xl font-normal leading-snug tracking-tight text-[#241E1C]">
                        {currentService.cardTitle}
                      </h3>
                    </div>

                    {/* Фиксированная минимальная высота для блока описания */}
                    <div className="mt-4 min-h-[132px] max-w-lg sm:min-h-[120px]">
                      <p className="text-sm sm:text-base leading-relaxed text-[#6E645F]">
                        {currentService.desc}
                      </p>
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Нижняя плашка всегда зафиксирована внизу карточки */}
              <div>
                <div className="my-6 h-[1px] w-full bg-black/10" />

                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
                  <div>
                    <span className="block text-xs uppercase tracking-wider text-[#9C8F87]">
                      Стоимость:
                    </span>
                    <span className="text-3xl sm:text-4xl font-light text-[#241E1C]">
                      {currentService.price}
                    </span>
                    <span className="block mt-1 text-xs text-[#8C7E77]">
                      {currentService.duration}
                    </span>
                  </div>

                  <a
                    href="#contacts"
                    className="inline-flex w-full items-center justify-center rounded-2xl bg-[#614535] px-6 py-4 text-center text-xs font-semibold uppercase tracking-[0.14em] text-white shadow-md transition-all hover:scale-105 hover:bg-[#432F24] active:scale-95 sm:w-auto sm:px-8"
                  >
                    Записаться на занятие
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
