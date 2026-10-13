import { useRef, type ReactElement } from 'react';
import { motion, useScroll, useTransform, useSpring } from 'framer-motion';
import riderImg from '../assets/rider.png';

export function HeroSection(): ReactElement {
  const containerRef = useRef<HTMLElement>(null);

  // Скролл-прогресс по секции Hero
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end start'],
  });

  // Инерционная пружина для гладкого движения
  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 85,
    damping: 24,
    restDelta: 0.001,
  });

  // 1. Полёт влево по направлению прыжка
  const riderX = useTransform(smoothProgress, [0, 0.45, 1], ['0%', '-28%', '-70%']);

  // 2. Взмывание вверх
  const riderY = useTransform(smoothProgress, [0, 0.4, 1], ['0%', '-35%', '-95%']);

  // 3. Динамический наклон
  const riderRotate = useTransform(smoothProgress, [0, 0.5, 1], [0, -6, -12]);

  // 4. Перспективный зум
  const riderScale = useTransform(smoothProgress, [0, 0.4, 1], [1, 1.08, 0.95]);

  // 5. Плавное затухание в конце секции
  const riderOpacity = useTransform(smoothProgress, [0, 0.65, 0.95], [1, 0.95, 0]);

  return (
    <section
      ref={containerRef}
      id="hero"
      className="relative flex min-h-screen w-full max-w-full flex-col justify-between overflow-hidden bg-[#E4DAD0] px-4 pb-6 pt-24 sm:px-10 sm:pb-8 sm:pt-28 lg:px-16"
    >
      {/* Декоративное мягкое свечение фона */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-16 right-1/4 h-[550px] w-[550px] rounded-full bg-white/40 blur-3xl -z-10"
      />

      {/* Верхний отступ под парящий Navbar */}
      <div />

      {/* Интерактивный слой со всадником */}
      <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-end overflow-hidden pr-0 sm:pr-8 lg:pr-14">
        <motion.div
          style={{
            x: riderX,
            y: riderY,
            rotate: riderRotate,
            scale: riderScale,
            opacity: riderOpacity,
          }}
          /* Опустили ниже навбара: top-16 на мобильных, top-20 на планшетах, top-24 на десктопе */
          className="relative right-[-3rem] top-10 w-[270px] drop-shadow-[0_25px_35px_rgba(58,47,43,0.18)] sm:right-6 sm:top-20 sm:w-[460px] md:w-[540px] lg:right-10 lg:top-24 lg:w-[620px]"
        >
          {/* Мягкое парение на месте в покое */}
          <motion.div
            animate={{
              y: [0, -6, 0],
            }}
            transition={{
              duration: 4,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          >
            <img
              src={riderImg}
              alt="Всадник СЛКС Тамбов"
              className="h-auto w-full object-contain"
              loading="eager"
            />
          </motion.div>
        </motion.div>
      </div>

      {/* Контентный блок: Заголовок слева и карточка справа */}
      <div className="relative z-20 mx-auto grid w-full max-w-7xl grid-cols-1 items-end gap-8 pb-4 lg:grid-cols-12">
        {/* Левая часть: Гео-бейдж и заголовок */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col items-start lg:col-span-7"
        >
          <div className="mb-5 inline-flex items-center rounded-full border border-black/10 bg-white/80 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-luxury-dark/90 shadow-sm backdrop-blur-md">
            Тамбов · ул. Бастионная, 22АС2
          </div>

          <h1 className="max-w-full font-serif tracking-tight text-luxury-dark drop-shadow-sm">
            <span className="block text-3xl font-normal leading-[1.05] tracking-[-0.02em] sm:text-5xl lg:text-7xl">
              Искусство
            </span>
            <span className="mt-1 block text-3xl italic font-normal tracking-tight sm:text-5xl lg:text-7xl">
              быть в седле
            </span>
          </h1>
        </motion.div>

        {/* Правая часть: Плавающая карточка */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-30 lg:col-span-5"
        >
          <div className="rounded-[2rem] border border-white/80 bg-white/95 p-5 shadow-[0_20px_50px_rgba(58,47,43,0.12)] backdrop-blur-xl sm:rounded-[2.2rem] sm:p-9">
            <p className="text-xs font-normal leading-relaxed text-luxury-muted sm:text-sm">
              Семейный конный клуб, где обучение, спорт и забота о лошадях
              соединяются в одно красивое движение.
            </p>

            <div className="mt-5 flex w-full flex-col items-stretch gap-3 sm:mt-6 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
              <a
                href="#contacts"
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-[#36423A] px-6 py-3 text-xs font-medium text-white shadow-sm transition-all hover:scale-105 hover:bg-luxury-brown active:scale-95 sm:w-auto"
              >
                <span>Первое занятие</span>
                <span className="text-[12px]">↗</span>
              </a>

              <a
                href="#about"
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-luxury-border bg-white px-6 py-3 text-xs font-medium text-luxury-dark transition-all hover:scale-105 hover:bg-luxury-bg active:scale-95 sm:w-auto"
              >
                <span>О клубе</span>
                <span className="text-[12px]">↗</span>
              </a>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Круглая кнопка скролла */}
      <div className="relative z-20 mx-auto flex justify-center pb-2">
        <a
          href="#services"
          aria-label="Прокрутить к услугам"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-black/10 bg-white/90 text-luxury-dark shadow-md backdrop-blur-sm transition-all hover:scale-110 active:scale-95"
        >
          <svg
            className="h-4 w-4 animate-bounce text-luxury-dark"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </a>
      </div>
    </section>
  );
}
