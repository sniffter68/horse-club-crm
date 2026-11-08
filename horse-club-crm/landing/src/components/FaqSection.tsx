import type { ReactElement } from 'react';

const questions = [
  ['С какого возраста можно детям?', 'Катание в поводу доступно детям от 3 лет. Возраст, готовность ребёнка и формат занятия обсудите с администратором; для несовершеннолетнего заявку оставляет родитель или законный представитель.'],
  ['Есть ли ограничения по весу?', 'Допустимую нагрузку определяет тренер с учётом лошади и формата занятия. Уточните возможность записи у администратора до визита.'],
  ['Что надеть на первый урок?', 'Требования к одежде и обуви собраны в памятке «Что надеть и как подготовиться» перед этим разделом. Защитный шлем подберём в клубе.'],
  ['Нужна ли медицинская справка?', 'Требования зависят от формата занятий. До записи уточните у администратора, нужна ли справка. При сомнениях о допустимости нагрузки посоветуйтесь с врачом.'],
  ['Как перенести или отменить занятие?', 'Свяжитесь с администратором по телефону или в мессенджере как можно раньше. Условия переноса и отмены уточните при подтверждении записи.'],
];

export function FaqSection(): ReactElement {
  return <section id="faq" aria-labelledby="faq-heading" className="bg-luxury-bg px-6 py-10 sm:px-10 lg:px-16">
    <div className="mx-auto max-w-7xl">
      <h2 id="faq-heading" className="mb-6 font-serif text-[2rem] sm:text-5xl">Частые вопросы</h2>
      {questions.map(([question, answer]) => <details key={question} className="border-b border-black/15 py-2">
        <summary className="min-h-11 cursor-pointer py-3 font-semibold hover:text-club-action">{question}</summary>
        <p className="max-w-3xl pb-4 leading-relaxed text-club-secondary">{answer}</p>
      </details>)}
    </div>
  </section>;
}
