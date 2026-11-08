import type { ReactElement } from 'react';

export function ReviewsSection(): ReactElement {
  return (
    <section id="reviews" aria-labelledby="reviews-heading" className="bg-club-paper px-6 py-10 text-club-ink sm:px-10 md:py-16 lg:px-16">
      <div className="mx-auto max-w-2xl text-center">
        <h2 id="reviews-heading" className="font-serif text-2xl font-normal sm:text-3xl lg:text-4xl">Отзывы гостей клуба</h2>
        <p className="mt-4 text-sm leading-relaxed text-club-secondary sm:text-base">
          Гости делятся впечатлениями о занятиях и знакомстве с лошадьми в нашем сообществе ВКонтакте.
        </p>
        <a href="https://vk.ru/reviews-226780791" target="_blank" rel="noopener noreferrer"
          className="mt-6 inline-flex min-h-12 items-center justify-center rounded-xl bg-club-action px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-club-deep active:bg-club-secondary">
          Читать отзывы ВКонтакте
        </a>
      </div>
    </section>
  );
}
