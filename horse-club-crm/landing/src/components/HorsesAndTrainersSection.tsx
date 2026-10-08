import { useState, useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactElement } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

type TabType = 'horses' | 'trainers';

interface HorseItem {
  id: string;
  type: 'horse';
  name: string;
  breed: string;
  discipline: string;
  age: string;
  height: string;
  suit: string;
  character: string;
  fullBio: string;
  achievements: string[];
  image: string;
}

interface TrainerItem {
  id: string;
  type: 'trainer';
  name: string;
  role: string;
  experience: string;
  qualification: string;
  quote: string;
  fullBio: string;
  specialization: string[];
  image: string;
}

type ModalItem = HorseItem | TrainerItem;

const horsesData: HorseItem[] = [
  {
    id: 'h1',
    type: 'horse',
    name: 'Гранд Эмир',
    breed: 'Ганноверская порода',
    discipline: 'Конкур до 130 см',
    age: '9 лет',
    height: '172 см в холке',
    suit: 'Гнедая',
    character: 'Мощный, чуткий к средствам управления, надёжный турнирный боец.',
    fullBio:
      'Рожден в племенном конном заводе с безупречной конкурной родословной. Отличается мощным техничным прыжком, гибкостью и абсолютным хладнокровием на маршрутах повышенной сложности. Отличный боевой партнер для всадников с опытом.',
    achievements: ['Призёр кубка Черноземья по конкуру', 'Маршруты 120-130 см без штрафных', 'Лицензированный спортивный паспорт'],
    image: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=1200&q=80',
  },
  {
    id: 'h2',
    type: 'horse',
    name: 'Бельканто',
    breed: 'Тракененская порода',
    discipline: 'Выездка (Малый приз)',
    age: '8 лет',
    height: '168 см в холке',
    suit: 'Вороная',
    character: 'Элегантные природные аллюры, уравновешенный темперамент, идеален для обучения.',
    fullBio:
      'Изящный выездковый жеребец с высокой природной каденцией и ритмичной рысью. Прекрасно слышит корпус всадника, чутко реагирует на малейшие полупируэты и боковые движения. Идеален для оттачивания высшей школы верховой езды.',
    achievements: ['Выполнение норматива Малого Приза', 'Широкая пластичная рысь с выраженным подвисанием', 'Мягкий контакт на поводе'],
    image: 'https://images.unsplash.com/photo-1558981403-c5f9899a28bc?auto=format&fit=crop&w=1200&q=80',
  },
  {
    id: 'h3',
    type: 'horse',
    name: 'Кавалер',
    breed: 'Голштинская порода',
    discipline: 'Начальная подготовка и прогулки',
    age: '11 лет',
    height: '166 см в холке',
    suit: 'Серая в яблоках',
    character: 'Терпеливый, добронравный партнёр для уверенных первых шагов в седле.',
    fullBio:
      'Любимец детских групп и начинающих всадников. Отличается редким спокойствием, вниманием к человеку и мягкими диванными аллюрами, на которых легко осваивать учебную рысь и правильное равновесие.',
    achievements: ['Более 5 лет безопасной работы с новичками', 'Идеален для фотосессий и лесных маршрутов', 'Дружелюбный контактный нрав'],
    image: 'https://images.unsplash.com/photo-1598974357801-cbca100e6571?auto=format&fit=crop&w=1200&q=80',
  },
];

const trainersData: TrainerItem[] = [
  {
    id: 't1',
    type: 'trainer',
    name: 'Елена Воронова',
    role: 'Старший тренер по выездке',
    experience: 'Стаж 14+ лет',
    qualification: 'Мастер спорта, судья всероссийской категории',
    quote: '«Гармония в паре начинается с взаимоуважения и правильной базовой посадки».',
    fullBio:
      'Выпускница Академии физической культуры и спорта по профилю конного спорта. Подготовила более 20 спортсменов-разрядников и призеров юношеских первенств. Методика строится на бережной биомеханике движения без форсирования.',
    specialization: ['Выездка уровней от юношеских езд до СП-1', 'Коррекция посадки всадника', 'Подготовка турнирных пар к стартам'],
    image: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=1200&q=80',
  },
  {
    id: 't2',
    type: 'trainer',
    name: 'Михаил Селезнёв',
    role: 'Тренер по конкуру',
    experience: 'Стаж 11 лет',
    qualification: 'КМС по конкуру, действующий турнирный всадник',
    quote: '«Прыжок — это не просто высота, а точный расчет каждого темпа галопа».',
    fullBio:
      'Специализируется на скоростных и маршрутных тренировках, расчете траекторий и работе над дистанцией. Учит читать барьеры, спокойно реагировать на закидки и выстраивать ментальное хладнокровие на турнирном поле.',
    specialization: ['Конкур от кавалетти до высоты 135 см', 'Гимнастика для спортивных лошадей', 'Тактика прохождения маршрутов'],
    image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=1200&q=80',
  },
  {
    id: 't3',
    type: 'trainer',
    name: 'Анна Кузнецова',
    role: 'Инструктор базовой верховой езды',
    experience: 'Стаж 7 лет',
    qualification: 'Специалист по адаптивной езде и детским группам',
    quote: '«Помогаю преодолеть страх и почувствовать лошадь с первой же тренировки».',
    fullBio:
      'Отвечает за самый важный этап — первое знакомство с клубом. Благодаря чуткому психологическому подходу мягко снимает мышечные зажимы у новичков, обучает правильному языку тела и технике безопасности на манеже.',
    specialization: ['Обучение верховой езде с нуля для взрослых и детей от 6 лет', 'Преодоление страха высоты и скорости', 'Посадка на корде'],
    image: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=1200&q=80',
  },
];

export function HorsesAndTrainersSection(): ReactElement {
  const [tab, setTab] = useState<TabType>('horses');
  const [selectedItem, setSelectedItem] = useState<ModalItem | null>(null);
  const modalTriggerRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Блокировка скролла страницы при открытой модалке и закрытие по клавише Esc
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        setSelectedItem(null);
      }
    }

    if (selectedItem) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
      closeButtonRef.current?.focus();
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
      if (selectedItem) {
        modalTriggerRef.current?.focus();
      }
    };
  }, [selectedItem]);

  const handleModalKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Tab') {
      return;
    }

    const focusableElements = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
    );
    if (focusableElements.length === 0) {
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  };

  return (
    <section id="horses-trainers" className="relative overflow-hidden bg-[#E4DAD0] px-6 py-28 sm:px-10 lg:px-16">
      <div className="mx-auto max-w-7xl">
        {/* Заголовок и переключатель */}
        <div className="flex flex-col items-start justify-between gap-8 sm:flex-row sm:items-end">
          <div>
            <span className="text-xs uppercase tracking-[0.2em] text-[#724C39]">Команда клуба</span>
            <h2 className="mt-3 font-serif text-4xl sm:text-6xl font-normal tracking-tight text-[#3A2F2B]">
              Лошади и наставники
            </h2>
          </div>

          {/* Таб-переключатель */}
          <div className="inline-flex rounded-full border border-black/10 bg-white/70 p-1.5 backdrop-blur-md">
            <button
              type="button"
              onClick={() => setTab('horses')}
              className={`rounded-full px-6 py-2.5 text-xs font-medium uppercase tracking-[0.12em] transition-all duration-300 ${
                tab === 'horses'
                  ? 'bg-[#3A2F2B] text-white shadow-sm'
                  : 'text-[#5C4F49] hover:text-[#3A2F2B]'
              }`}
            >
              Лошади клуба
            </button>
            <button
              type="button"
              onClick={() => setTab('trainers')}
              className={`rounded-full px-6 py-2.5 text-xs font-medium uppercase tracking-[0.12em] transition-all duration-300 ${
                tab === 'trainers'
                  ? 'bg-[#3A2F2B] text-white shadow-sm'
                  : 'text-[#5C4F49] hover:text-[#3A2F2B]'
              }`}
            >
              Тренеры
            </button>
          </div>
        </div>

        {/* Сетка карточек с кликом для раскрытия */}
        <AnimatePresence mode="wait">
          {tab === 'horses' ? (
            <motion.div
              key="horses-grid"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.45 }}
              className="mt-14 grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3"
            >
              {horsesData.map((horse) => (
                <button
                  key={horse.id}
                  type="button"
                  onClick={(event) => {
                    modalTriggerRef.current = event.currentTarget;
                    setSelectedItem(horse);
                  }}
                  className="group relative flex w-full flex-col overflow-hidden rounded-[2.2rem] border border-white/80 bg-white/90 text-left shadow-[0_15px_35px_rgba(58,47,43,0.06)] backdrop-blur-lg transition-all duration-500 hover:-translate-y-1.5 hover:shadow-[0_25px_45px_rgba(58,47,43,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#724C39]"
                >
                  <div className="relative h-72 w-full overflow-hidden">
                    <img
                      src={horse.image}
                      alt={horse.name}
                      className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                    <div className="absolute top-4 right-4 rounded-full bg-white/90 px-3.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#3A2F2B] backdrop-blur-md">
                      {horse.age}
                    </div>
                  </div>

                  <div className="flex flex-1 flex-col justify-between p-7">
                    <div>
                      <span className="text-[11px] uppercase tracking-[0.16em] text-[#724C39]">
                        {horse.breed}
                      </span>
                      <h3 className="mt-1 font-serif text-2xl font-normal text-[#3A2F2B]">
                        {horse.name}
                      </h3>
                      <p className="mt-3 text-xs leading-relaxed text-[#6E645F] line-clamp-2">
                        {horse.character}
                      </p>
                    </div>

                    <div className="mt-6 flex items-center justify-between border-t border-black/5 pt-4 text-xs">
                      <span className="font-medium text-[#3A2F2B]">{horse.discipline}</span>
                      <span className="inline-flex items-center gap-1 font-semibold text-[#724C39] group-hover:translate-x-1 transition-transform">
                        Подробнее ↗
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </motion.div>
          ) : (
            <motion.div
              key="trainers-grid"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.45 }}
              className="mt-14 grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3"
            >
              {trainersData.map((trainer) => (
                <button
                  key={trainer.id}
                  type="button"
                  onClick={(event) => {
                    modalTriggerRef.current = event.currentTarget;
                    setSelectedItem(trainer);
                  }}
                  className="group relative flex w-full flex-col overflow-hidden rounded-[2.2rem] border border-white/80 bg-white/90 text-left shadow-[0_15px_35px_rgba(58,47,43,0.06)] backdrop-blur-lg transition-all duration-500 hover:-translate-y-1.5 hover:shadow-[0_25px_45px_rgba(58,47,43,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#724C39]"
                >
                  <div className="relative h-72 w-full overflow-hidden">
                    <img
                      src={trainer.image}
                      alt={trainer.name}
                      className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                    <div className="absolute top-4 right-4 rounded-full bg-[#3A2F2B]/85 px-3.5 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-white backdrop-blur-md">
                      {trainer.experience}
                    </div>
                  </div>

                  <div className="flex flex-1 flex-col justify-between p-7">
                    <div>
                      <span className="text-[11px] uppercase tracking-[0.16em] text-[#724C39]">
                        {trainer.role}
                      </span>
                      <h3 className="mt-1 font-serif text-2xl font-normal text-[#3A2F2B]">
                        {trainer.name}
                      </h3>
                      <p className="mt-2 text-xs font-medium text-[#5C4F49]">
                        {trainer.qualification}
                      </p>
                      <p className="mt-3 text-xs italic leading-relaxed text-[#7C716B] line-clamp-2">
                        {trainer.quote}
                      </p>
                    </div>

                    <div className="mt-6 flex items-center justify-between border-t border-black/5 pt-4">
                      <span className="text-xs font-medium text-[#3A2F2B] group-hover:text-[#724C39] transition-colors">
                        Биография наставника
                      </span>
                      <span className="inline-flex items-center gap-1 font-semibold text-[#724C39] group-hover:translate-x-1 transition-transform">
                        Подробнее ↗
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Модальное окно раскрытой карточки */}
      <AnimatePresence>
        {selectedItem && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 sm:p-6 md:p-10">
            {/* Тёмно-бежевый блюр-оверлей */}
            <motion.button
              type="button"
              aria-label="Закрыть подробную информацию"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedItem(null)}
              className="absolute inset-0 bg-[#241E1C]/60 backdrop-blur-md"
            />

            {/* Раскрытая карточка */}
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 24 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              role="dialog"
              aria-modal="true"
              aria-label={`Подробная информация: ${selectedItem.name}`}
              onKeyDown={handleModalKeyDown}
              className="relative z-10 flex max-h-[85vh] w-full max-w-4xl flex-col overflow-y-auto rounded-[2rem] border border-white/80 bg-[#FAF7F2] shadow-[0_30px_70px_rgba(0,0,0,0.35)] sm:rounded-[2.5rem] md:flex-row"
            >
              {/* Круглая кнопка закрытия с крестиком */}
              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => setSelectedItem(null)}
                aria-label="Закрыть"
                className="absolute right-3 top-3 z-30 flex h-12 w-12 items-center justify-center rounded-full border border-black/10 bg-white/95 text-[#3A2F2B] shadow-md backdrop-blur-sm transition-transform hover:scale-110 active:scale-95 sm:right-5 sm:top-5"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              {/* Левая половина: крупная фотография */}
              <div className="relative h-56 w-full shrink-0 overflow-hidden md:h-auto md:w-5/12">
                <img
                  src={selectedItem.image}
                  alt={selectedItem.name}
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent md:hidden" />
              </div>

              {/* Правая половина: детали и параметры */}
              <div className="flex shrink-0 flex-col justify-between p-5 sm:p-10 md:min-h-0 md:flex-1 md:shrink">
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#724C39]">
                    {selectedItem.type === 'horse' ? selectedItem.breed : selectedItem.role}
                  </span>

                  <h3 className="mt-1 font-serif text-3xl sm:text-4xl font-normal text-[#3A2F2B]">
                    {selectedItem.name}
                  </h3>

                  {selectedItem.type === 'trainer' && (
                    <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-[#8C7E77]">
                      {selectedItem.qualification} · {selectedItem.experience}
                    </p>
                  )}

                  {/* Параметры лошади */}
                  {selectedItem.type === 'horse' && (
                    <div className="mt-5 grid grid-cols-3 gap-3 rounded-2xl bg-white/80 p-3.5 border border-black/5 text-center">
                      <div>
                        <span className="block text-[10px] uppercase text-[#8C7E77]">Возраст</span>
                        <span className="font-semibold text-xs text-[#3A2F2B]">{selectedItem.age}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] uppercase text-[#8C7E77]">Рост</span>
                        <span className="font-semibold text-xs text-[#3A2F2B]">{selectedItem.height}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] uppercase text-[#8C7E77]">Масть</span>
                        <span className="font-semibold text-xs text-[#3A2F2B]">{selectedItem.suit}</span>
                      </div>
                    </div>
                  )}

                  {/* Цитата тренера */}
                  {selectedItem.type === 'trainer' && (
                    <blockquote className="mt-4 rounded-2xl border-l-2 border-[#724C39] bg-white/70 p-4 text-xs italic leading-relaxed text-[#5C4F49]">
                      {selectedItem.quote}
                    </blockquote>
                  )}

                  {/* Полный биографический текст */}
                  <div className="mt-5">
                    <h4 className="text-[11px] uppercase tracking-wider text-[#8C7E77] font-semibold mb-1.5">
                      {selectedItem.type === 'horse' ? 'Особенности и подготовка' : 'О наставнике'}
                    </h4>
                    <p className="text-xs sm:text-sm leading-relaxed text-[#6E645F]">
                      {selectedItem.fullBio}
                    </p>
                  </div>

                  {/* Список достижений / специализаций */}
                  <div className="mt-5">
                    <h4 className="text-[11px] uppercase tracking-wider text-[#8C7E77] font-semibold mb-2">
                      {selectedItem.type === 'horse' ? 'Ключевые преимущества' : 'Специализация'}
                    </h4>
                    <ul className="flex flex-col gap-1.5">
                      {(selectedItem.type === 'horse'
                        ? selectedItem.achievements
                        : selectedItem.specialization
                      ).map((point, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-xs text-[#5C4F49]">
                          <span className="text-[#724C39] font-bold">✓</span>
                          <span>{point}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Нижняя планка с кнопкой записи */}
                <div className="mt-8 flex flex-col items-stretch justify-between gap-4 border-t border-black/10 pt-5 sm:flex-row sm:items-center">
                  <div className="text-xs text-[#8C7E77]">
                    {selectedItem.type === 'horse' ? selectedItem.discipline : 'Индивидуальные тренировки'}
                  </div>

                  <a
                    href="#contacts"
                    onClick={() => setSelectedItem(null)}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-[#3A2F2B] px-6 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-white shadow-sm transition-all hover:scale-105 hover:bg-[#5A483E] active:scale-95 sm:w-auto"
                  >
                    <span>Записаться</span>
                    <span>↗</span>
                  </a>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </section>
  );
}
