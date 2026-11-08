import { Carousel } from './Carousel';
import { handleCatalogImageError } from '../catalogImage';
import type { PublicHorse, PublicTrainer } from '../usePublicContent';
import { useState, useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactElement } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ChooseBooking } from '../booking';

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

export function HorsesAndTrainersSection({ horses, trainers, onChoose }: { horses: PublicHorse[]; trainers: PublicTrainer[]; onChoose: ChooseBooking }): ReactElement {
  const horsesData: HorseItem[] = horses.map(item => ({
    id: item.id, type: 'horse', name: item.name, breed: item.breed, discipline: item.role,
    age: '', height: '', suit: '', character: item.description,
    fullBio: item.description, achievements: [], image: item.imageUrl,
  }));
  const trainersData: TrainerItem[] = trainers.map(item => ({
    id: item.id, type: 'trainer', name: item.name, role: item.role, experience: item.experience,
    qualification: item.qualification, quote: '', fullBio: item.description,
    specialization: item.specializations, image: item.imageUrl,
  }));
  const carouselPositions = useRef({ horses: 0, trainers: 0 });
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
    <section id="horses-trainers" className="relative overflow-hidden bg-club-sand px-6 py-10 md:py-16 sm:px-10 lg:px-16">
      <div className="mx-auto max-w-7xl">
        {/* Заголовок и переключатель */}
        <div className="flex flex-col items-start justify-between gap-4 md:gap-6 sm:flex-row sm:items-end">
          <div>
            <span className="text-sm text-club-action">Команда клуба</span>
            <h2 className="leading-[1.125] mt-3 font-serif tracking-tight text-club-ink text-2xl sm:text-3xl lg:text-4xl font-normal">
              Лошади и наставники
            </h2>
          </div>

          {/* Таб-переключатель */}
          <div className="inline-flex rounded-full border border-black/10 bg-white/70 p-1.5 backdrop-blur-md">
            <button
              type="button"
              aria-pressed={tab === 'horses'}
              onClick={() => setTab('horses')}
              className={`rounded-full px-6 py-2.5 text-sm font-medium   transition-all duration-300 ${
                tab === 'horses'
                  ? 'bg-club-ink text-white shadow-sm'
                  : 'text-club-secondary hover:text-club-ink'
              }`}
            >
              Лошади клуба
            </button>
            <button
              type="button"
              aria-pressed={tab === 'trainers'}
              onClick={() => setTab('trainers')}
              className={`rounded-full px-6 py-2.5 text-sm font-medium   transition-all duration-300 ${
                tab === 'trainers'
                  ? 'bg-club-ink text-white shadow-sm'
                  : 'text-club-secondary hover:text-club-ink'
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
              className="mt-6 md:mt-8"
            >
              <Carousel nativeMobile label="Лошади клуба" initialIndex={carouselPositions.current.horses}
                onIndexChange={index => { carouselPositions.current.horses = index; }}>
                {horsesData.map((horse) => (
                  <button
                    key={horse.id}
                    type="button"
                    onClick={(event) => {
                      modalTriggerRef.current = event.currentTarget;
                      setSelectedItem(horse);
                    }}
                    className="group relative flex w-full flex-col overflow-hidden rounded-[2.2rem] border border-white/80 bg-white/90 text-left shadow-[0_15px_35px_rgba(58,47,43,0.06)] backdrop-blur-lg transition-all duration-500 hover:-translate-y-1.5 hover:shadow-[0_25px_45px_rgba(58,47,43,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-club-action"
                  >
                    <div className="relative h-52 sm:h-60 w-full overflow-hidden">
                      <img loading="lazy" decoding="async"
                    onError={handleCatalogImageError}
                        src={horse.image}
                        alt={horse.name}
                        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                      />
                      <div className="absolute top-4 right-4 rounded-full bg-white/90 px-3.5 py-1 text-sm font-semibold text-club-ink backdrop-blur-md">
                        {horse.breed || horse.discipline}
                      </div>
                    </div>

                    <div className="flex flex-1 flex-col justify-between p-5 md:p-6">
                      <div>
                        <span className="text-sm text-club-action">
                          {horse.breed}
                        </span>
                        <h3 className="mt-1 font-serif text-club-ink text-lg sm:text-xl font-semibold">
                          {horse.name}
                        </h3>
                        <p className="mt-3 text-sm sm:text-base leading-relaxed text-club-secondary line-clamp-2">
                          {horse.character}
                        </p>
                      </div>

                      <div className="mt-6 flex items-center justify-between border-t border-black/5 pt-4 text-sm">
                        <span className="font-medium text-club-ink">{horse.discipline}</span>
                        <span className="inline-flex items-center gap-1 font-semibold text-club-action group-hover:translate-x-1 transition-transform">
                          Подробнее
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </Carousel>
            </motion.div>
          ) : (
            <motion.div
              key="trainers-grid"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.45 }}
              className="mt-6 md:mt-8"
            >
              <Carousel nativeMobile label="Тренеры" initialIndex={carouselPositions.current.trainers}
                onIndexChange={index => { carouselPositions.current.trainers = index; }}>
                {trainersData.map((trainer) => (
                  <button
                    key={trainer.id}
                    type="button"
                    onClick={(event) => {
                      modalTriggerRef.current = event.currentTarget;
                      setSelectedItem(trainer);
                    }}
                    className="group relative flex w-full flex-col overflow-hidden rounded-[2.2rem] border border-white/80 bg-white/90 text-left shadow-[0_15px_35px_rgba(58,47,43,0.06)] backdrop-blur-lg transition-all duration-500 hover:-translate-y-1.5 hover:shadow-[0_25px_45px_rgba(58,47,43,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-club-action"
                  >
                    <div className="relative h-52 sm:h-60 w-full overflow-hidden">
                      <img loading="lazy" decoding="async"
                    onError={handleCatalogImageError}
                        src={trainer.image}
                        alt={trainer.name}
                        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                      />
                      <div className="absolute top-4 right-4 rounded-full bg-club-ink/85 px-3.5 py-1 text-sm font-medium text-white backdrop-blur-md">
                        {trainer.experience}
                      </div>
                    </div>

                    <div className="flex flex-1 flex-col justify-between p-5 md:p-6">
                      <div>
                        <span className="text-sm text-club-action">
                          {trainer.role}
                        </span>
                        <h3 className="mt-1 font-serif text-club-ink text-lg sm:text-xl font-semibold">
                          {trainer.name}
                        </h3>
                        <p className="mt-2 text-sm sm:text-base font-medium text-club-secondary">
                          {trainer.qualification}
                        </p>
                        <p className="mt-3 text-sm sm:text-base italic leading-relaxed text-club-secondary line-clamp-2">
                          {trainer.quote}
                        </p>
                      </div>

                      <div className="mt-6 flex items-center justify-between border-t border-black/5 pt-4">
                        <span className="text-sm font-medium text-club-ink group-hover:text-club-action transition-colors">
                          Биография наставника
                        </span>
                        <span className="inline-flex items-center gap-1 font-semibold text-club-action group-hover:translate-x-1 transition-transform">
                          Подробнее
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </Carousel>
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
              className="absolute inset-0 bg-club-deep/60 backdrop-blur-md"
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
              className="relative z-10 flex max-h-[85vh] w-full max-w-4xl flex-col overflow-y-auto rounded-[2rem] border border-white/80 bg-club-paper shadow-[0_30px_70px_rgba(0,0,0,0.35)] sm:rounded-[2.5rem] md:flex-row"
            >
              {/* Круглая кнопка закрытия с крестиком */}
              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => setSelectedItem(null)}
                aria-label="Закрыть"
                className="absolute right-3 top-3 z-30 flex h-12 w-12 items-center justify-center rounded-full border border-black/10 bg-white/95 text-club-ink shadow-md backdrop-blur-sm transition-transform hover:scale-110 active:scale-95 sm:right-5 sm:top-5"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              {/* Левая половина: крупная фотография */}
              <div className="relative h-56 w-full shrink-0 overflow-hidden md:h-auto md:w-5/12">
                <img loading="lazy" decoding="async"
                  onError={handleCatalogImageError}
                  src={selectedItem.image}
                  alt={selectedItem.name}
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent md:hidden" />
              </div>

              {/* Правая половина: детали и параметры */}
              <div className="flex shrink-0 flex-col justify-between p-5 md:p-6 md:min-h-0 md:flex-1 md:shrink">
                <div>
                  <span className="text-sm font-semibold text-club-action">
                    {selectedItem.type === 'horse' ? selectedItem.breed : selectedItem.role}
                  </span>

                  <h3 className="mt-1 font-serif text-club-ink text-lg sm:text-xl font-semibold">
                    {selectedItem.name}
                  </h3>

                  {selectedItem.type === 'trainer' && (
                    <p className="mt-2 text-sm sm:text-base font-semibold text-club-secondary">
                      {[selectedItem.qualification, selectedItem.experience].filter(Boolean).join(' · ')}
                    </p>
                  )}

                  {/* Параметры лошади */}
                  {selectedItem.type === 'horse' && selectedItem.age && (
                    <div className="mt-5 grid grid-cols-3 gap-3 rounded-2xl bg-white/80 p-3.5 border border-black/5 text-center">
                      <div>
                        <span className="block text-sm text-club-secondary">Возраст</span>
                        <span className="font-semibold text-sm text-club-ink">{selectedItem.age}</span>
                      </div>
                      <div>
                        <span className="block text-sm text-club-secondary">Рост</span>
                        <span className="font-semibold text-sm text-club-ink">{selectedItem.height}</span>
                      </div>
                      <div>
                        <span className="block text-sm text-club-secondary">Масть</span>
                        <span className="font-semibold text-sm text-club-ink">{selectedItem.suit}</span>
                      </div>
                    </div>
                  )}

                  {/* Цитата тренера */}
                  {selectedItem.type === 'trainer' && selectedItem.quote && (
                    <blockquote className="mt-4 rounded-2xl border-l-2 border-club-action bg-white/70 p-4 text-sm italic leading-relaxed text-club-secondary">
                      {selectedItem.quote}
                    </blockquote>
                  )}

                  {/* Полный биографический текст */}
                  {selectedItem.fullBio && <div className="mt-5">
                    <h4 className="text-sm text-club-secondary font-semibold mb-1.5">
                      {selectedItem.type === 'horse' ? 'Особенности и подготовка' : 'О наставнике'}
                    </h4>
                    <p className="text-sm sm:text-base leading-relaxed text-club-secondary">
                      {selectedItem.fullBio}
                    </p>
                  </div>}

                  {/* Список достижений / специализаций */}
                  {(selectedItem.type === 'horse' ? selectedItem.achievements : selectedItem.specialization).length > 0 && <div className="mt-5">
                    <h4 className="text-sm text-club-secondary font-semibold mb-2">
                      {selectedItem.type === 'horse' ? 'Ключевые преимущества' : 'Специализация'}
                    </h4>
                    <ul className="flex flex-col gap-1.5">
                      {(selectedItem.type === 'horse'
                        ? selectedItem.achievements
                        : selectedItem.specialization
                      ).map((point, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm text-club-secondary">
                          <span className="text-club-action font-bold">✓</span>
                          <span>{point}</span>
                        </li>
                      ))}
                    </ul>
                  </div>}
                </div>

                {/* Нижняя планка с кнопкой записи */}
                <div className="mt-6 flex flex-col items-stretch justify-between gap-4 border-t border-black/10 pt-5 sm:flex-row sm:items-center">
                  <div className="text-sm text-club-secondary">
                    {selectedItem.type === 'horse' ? selectedItem.discipline : 'Индивидуальные тренировки'}
                  </div>

                  <a
                    href="#booking-form"
                    onClick={event => {
                      event.preventDefault();
                      setSelectedItem(null);
                      onChoose(selectedItem.type, { id: selectedItem.id, name: selectedItem.name });
                    }}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-club-ink px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:scale-105 hover:bg-club-secondary active:scale-95 sm:w-auto"
                  >
                    <span>Записаться</span>
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
