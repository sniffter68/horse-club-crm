import type { ReactElement, SyntheticEvent } from 'react';

const imageBase = `${import.meta.env.BASE_URL}images/`;

function handleHeroImageError(event: SyntheticEvent<HTMLImageElement>): void {
  const image = event.currentTarget;
  const fallback = `${imageBase}first-meeting-fallback.jpg`;
  if (image.getAttribute('src') !== fallback) image.src = fallback;
}

export function HeroSection({ onBookFirstLesson }: { onBookFirstLesson: () => void }): ReactElement {
  return (
    <section id="hero" aria-labelledby="hero-heading" className="landing-hero bg-luxury-bg px-6 pb-10 pt-24 md:pb-16 md:pt-28 sm:px-10 lg:px-16">
      <div className="landing-hero__layout mx-auto grid w-full max-w-7xl items-center gap-6 lg:gap-8">
        <div className="min-w-0">
          <a href="https://yandex.ru/maps/?text=Тамбов+ул+Бастионная+22АС2" target="_blank" rel="noopener noreferrer"
            className="mb-4 inline-block text-sm leading-5 text-luxury-muted transition-colors hover:text-luxury-dark hover:underline underline-offset-4">Тамбов · ул. Бастионная, 22АС2</a>
          <h1 id="hero-heading" className="landing-hero__heading font-serif font-normal text-luxury-dark text-3xl sm:text-4xl lg:text-5xl leading-tight">
            Ваш первый шаг к лошадям — без страха и суеты
          </h1>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-luxury-muted sm:text-lg">
            Спокойные лошади, внимательные тренеры рядом на каждом шагу
            и забота о безопасности с первых минут в манеже.
          </p>
          <ul className="mt-4 grid gap-1 text-sm leading-5 text-luxury-muted">
            <li>Лошадь держит тренер — вы всё время вместе</li>
            <li>Шлем и экипировку выдаём бесплатно</li>
            <li>Начинаем со спокойного шага, в вашем темпе</li>
          </ul>
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <a href="#booking"
              onClick={event => { event.preventDefault(); onBookFirstLesson(); }}
              className="inline-flex min-h-12 items-center justify-center rounded-xl bg-luxury-brown px-6 py-3 text-[15px] font-medium text-white transition-colors hover:bg-luxury-dark active:bg-luxury-deep">
              Попробовать первое занятие
            </a>
            <a href="#about" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-luxury-muted px-6 py-3 text-[15px] font-medium text-luxury-dark transition-colors hover:bg-luxury-card active:bg-white">
              О клубе
            </a>
          </div>
        </div>
        <div className="landing-hero__visual relative min-w-0 overflow-hidden rounded-3xl bg-club-sand">
          <img onError={handleHeroImageError} src={`${imageBase}first-meeting.jpg`} alt="Улыбающийся ребёнок гладит спокойную лошадь, тренер рядом держит повод" loading="eager" fetchPriority="high"
            width={1448} height={1086}
            className="landing-hero__photo h-full w-full object-cover" />
        </div>
      </div>
      <a href="#services" aria-label="Прокрутить к услугам"
        className="mx-auto mt-6 flex h-11 w-11 items-center justify-center rounded-full border border-luxury-muted text-luxury-dark transition-colors hover:bg-luxury-card">
        <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </a>
    </section>
  );
}
