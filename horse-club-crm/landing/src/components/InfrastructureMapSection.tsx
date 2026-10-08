import { useRef, useState, type ReactElement } from 'react';
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion';

interface Hotspot {
  id: string;
  number: string;
  title: string;
  subtitle: string;
  desc: string;
  x: string;
  y: string;
  triggerStart: number;
  triggerEnd: number;
}

const hotspots: Hotspot[] = [
  {
    id: 'manej',
    number: '01',
    title: 'Крытый евро-манеж',
    subtitle: '1 800 м² · круглогодичный тренинг',
    desc: 'Профессиональный еврогрунт с немецким геотекстилем и системой обеспыливания. Идеальное сцепление и амортизация суставов лошади в любую погоду.',
    x: '32%',
    y: '42%',
    triggerStart: 0.12,
    triggerEnd: 0.38,
  },
  {
    id: 'platc',
    number: '02',
    title: 'Открытый боевой плац',
    subtitle: '60 × 40 м · турнирный стандарт',
    desc: 'Всепогодная дренажная система, комплект турнирных конкурных барьеров и судейская вышка для клубных и региональных стартов.',
    x: '68%',
    y: '36%',
    triggerStart: 0.36,
    triggerEnd: 0.62,
  },
  {
    id: 'bochka',
    number: '03',
    title: 'Крытая бочка',
    subtitle: 'Диаметр 18 м · кордовая работа',
    desc: 'Безопасное пространство со сплошными наклонными бортами для моциона, заездки молодых лошадей и работы на корде.',
    x: '24%',
    y: '68%',
    triggerStart: 0.6,
    triggerEnd: 0.82,
  },
  {
    id: 'stables',
    number: '04',
    title: 'Конюшня и денники',
    subtitle: '24 денника 3×4 м · микроклимат',
    desc: 'Широкие проходы, приточно-вытяжная вентиляция, автопоилки с подогревом, солярий для сушки и релаксации мышц.',
    x: '56%',
    y: '72%',
    triggerStart: 0.8,
    triggerEnd: 1.0,
  },
];

function clamp01(val: number): number {
  return Math.max(0, Math.min(1, Number(val.toFixed(3))));
}

export function InfrastructureMapSection(): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activePin, setActivePin] = useState<string | null>(hotspots[0].id);

  // Резервный URL, если локальный файл еще не положили в public/images/club-plan.jpg
  const fallbackImage =
    'https://images.unsplash.com/photo-1551884170-09fb70a3a2ed?auto=format&fit=crop&w=2400&q=85';
  const [mapImageSrc, setMapImageSrc] = useState<string>('/images/club-plan.jpg');

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  });

  const mapScale = useTransform(scrollYProgress, [0, 1], [1, 1.12]);

  return (
    <section
      ref={containerRef}
      id="infrastructure-map"
      className="relative h-[240vh] bg-[#1E1917] text-white"
    >
      <div className="sticky top-0 flex h-screen w-full flex-col justify-between overflow-hidden">
        {/* Панорама комплекса с мягким зумом */}
        <motion.div
          style={{ scale: mapScale }}
          className="absolute inset-0 -z-10 origin-center"
        >
          <img
            src={mapImageSrc}
            alt="Территория конного клуба СЛКС Тамбов"
            onError={() => {
              if (mapImageSrc !== fallbackImage) {
                setMapImageSrc(fallbackImage);
              }
            }}
            className="h-full w-full object-cover object-center"
          />
          {/* Деликатный градиент, чтобы снимок не уходил в полную тьму */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#1E1917]/90 via-[#1E1917]/25 to-[#1E1917]/60" />
        </motion.div>

        {/* Верхняя планка */}
        <div className="relative z-20 mx-auto flex w-full max-w-7xl items-start justify-between px-6 pt-24 sm:px-10 lg:px-16">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[#CBB9AC]">
              Интерактивная карта
            </span>
            <h2 className="mt-2 font-serif text-3xl font-normal tracking-tight text-[#FAF7F2] sm:text-5xl">
              Инфраструктура клуба
            </h2>
          </div>

          <div className="hidden items-center gap-3 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs uppercase tracking-widest text-[#E4DAD0] backdrop-blur-md sm:flex">
            <span className="h-2 w-2 animate-ping rounded-full bg-[#E4DAD0]" />
            <span>Нажмите на точку или скролльте</span>
          </div>
        </div>

        {/* Интерактивные метки */}
        <div className="pointer-events-none absolute inset-0 z-20">
          <div className="relative mx-auto h-full w-full max-w-7xl">
            {hotspots.map((spot) => {
              const pStartFade = clamp01(spot.triggerStart - 0.05);
              const pStartHold = clamp01(spot.triggerStart);
              const pEndHold = clamp01(spot.triggerEnd - 0.03);
              const pEndFade = clamp01(spot.triggerEnd);

              const opacity = useTransform(
                scrollYProgress,
                [pStartFade, pStartHold, pEndHold, pEndFade],
                [0.35, 1, 1, 0.35]
              );

              const isActive = activePin === spot.id;

              return (
                <motion.div
                  key={spot.id}
                  style={{
                    left: spot.x,
                    top: spot.y,
                    opacity,
                  }}
                  className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2"
                >
                  <button
                    type="button"
                    onClick={() => setActivePin(isActive ? null : spot.id)}
                    className="group relative flex items-center justify-center outline-none"
                  >
                    <span className="absolute h-10 w-10 animate-ping rounded-full bg-[#FAF7F2]/25 duration-1000 sm:h-12 sm:w-12" />
                    <div
                      className={`relative flex h-9 w-9 items-center justify-center rounded-full border border-white/70 shadow-lg backdrop-blur-md transition-all sm:h-11 sm:w-11 ${
                        isActive
                          ? 'bg-[#724C39] scale-110 ring-2 ring-white/60'
                          : 'bg-[#241E1C]/90 hover:scale-105 hover:bg-[#5A483E]'
                      }`}
                    >
                      <span className="font-serif text-xs font-semibold text-white">
                        {spot.number}
                      </span>
                    </div>

                    <div className="ml-3 hidden items-center rounded-full border border-white/20 bg-[#241E1C]/85 px-3 py-1 text-[11px] font-medium tracking-wide text-[#FAF7F2] shadow-lg backdrop-blur-md transition-transform group-hover:translate-x-1 sm:flex">
                      {spot.title}
                    </div>
                  </button>

                  <AnimatePresence>
                    {isActive && (
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.95 }}
                        transition={{ duration: 0.25 }}
                        className="absolute left-1/2 top-14 z-30 w-72 -translate-x-1/2 sm:left-full sm:top-0 sm:ml-4 sm:translate-x-0 sm:w-80"
                      >
                        <div className="rounded-3xl border border-white/25 bg-[#241E1C]/95 p-5 shadow-[0_20px_45px_rgba(0,0,0,0.6)] backdrop-blur-xl">
                          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#CBB9AC]">
                            {spot.subtitle}
                          </span>
                          <h3 className="mt-1 font-serif text-lg font-normal text-[#FAF7F2]">
                            {spot.title}
                          </h3>
                          <p className="mt-2 text-xs leading-relaxed text-[#A6988E]">
                            {spot.desc}
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Нижний переключатель объектов */}
        <div className="relative z-20 mx-auto w-full max-w-7xl px-6 pb-8 sm:px-10 lg:px-16">
          <div className="grid grid-cols-2 gap-2 border-t border-white/10 pt-4 text-[11px] uppercase tracking-wider text-[#A6988E] sm:grid-cols-4">
            {hotspots.map((spot) => (
              <button
                key={spot.id}
                type="button"
                onClick={() => setActivePin(spot.id)}
                className={`text-left transition-colors ${
                  activePin === spot.id ? 'text-[#FAF7F2] font-semibold' : 'hover:text-[#FAF7F2]'
                }`}
              >
                {spot.number} {spot.title}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}