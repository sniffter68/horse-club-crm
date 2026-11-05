import { type ReactElement } from 'react';
import riderImg from '../assets/rider.png';

export function HeroSection({ onBookFirstLesson }: { onBookFirstLesson: () => void }): ReactElement {
  return (
    <section id="hero" aria-labelledby="hero-heading" className="landing-hero bg-luxury-bg px-6 pb-12 pt-28 sm:px-10 lg:px-16">
      <div className="mx-auto grid w-full max-w-7xl items-center gap-8 lg:grid-cols-2 lg:gap-12">
        <div className="min-w-0">
          <p className="mb-6 text-sm leading-5 text-luxury-muted">Тамбов · ул. Бастионная, 22АС2</p>
          <h1 id="hero-heading" className="landing-hero__heading font-serif font-normal text-luxury-dark">
            Искусство<br />быть в седле
          </h1>
          <p className="mt-6 max-w-lg text-base leading-relaxed text-luxury-muted sm:text-lg">
            Семейный конный клуб, где обучение, спорт и забота о лошадях
            соединяются в одно красивое движение.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <a href="#booking-form"
              onClick={event => { event.preventDefault(); onBookFirstLesson(); }}
              className="inline-flex min-h-12 items-center justify-center rounded-xl bg-luxury-brown px-6 py-3 text-[15px] font-medium text-white transition-colors hover:bg-luxury-dark active:bg-luxury-deep">
              Записаться на первое занятие
            </a>
            <a href="#about" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-luxury-muted px-6 py-3 text-[15px] font-medium text-luxury-dark transition-colors hover:bg-luxury-card active:bg-white">
              О клубе
            </a>
          </div>
        </div>
        <div className="landing-hero__visual min-w-0">
          <img src={riderImg} alt="Всадник СЛКС Тамбов" loading="eager"
            className="h-full w-full object-contain" />
        </div>
      </div>
      <a href="#services" aria-label="Прокрутить к услугам"
        className="mx-auto mt-8 flex h-11 w-11 items-center justify-center rounded-full border border-luxury-muted text-luxury-dark transition-colors hover:bg-luxury-card">
        <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </a>
    </section>
  );
}
