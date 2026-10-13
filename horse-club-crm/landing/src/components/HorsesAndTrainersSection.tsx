import { useRef, useState } from 'react';
import type { PublicHorse, PublicTrainer } from '../usePublicContent';
import type { ChooseBooking } from '../booking';
import { CatalogBadges, CatalogPhoto } from './CatalogPhoto';
import { ModalDialog } from './ModalDialog';

type Person = { kind: 'horse'; item: PublicHorse } | { kind: 'trainer'; item: PublicTrainer };
function badges(person: Person): string[] {
  return person.kind === 'horse' ? [person.item.breed, person.item.role]
    : [person.item.role, person.item.qualification, ...person.item.specializations];
}

function CatalogDialog({ person, onClose, onChoose }: { person: Person; onClose: () => void; onChoose: ChooseBooking }) {
  return <ModalDialog className="catalog-dialog" labelledBy="catalog-dialog-heading" onClose={onClose}>
    <div className="relative">
      <button type="button" className="dialog-close" aria-label="Закрыть" autoFocus onClick={onClose}>×</button>
      <CatalogPhoto src={person.item.imageUrl} alt={person.item.name} />
      <div className="catalog-body">
        <h3 id="catalog-dialog-heading" className="catalog-title">{person.item.name}</h3>
        <CatalogBadges labels={badges(person)} full />
        {person.item.description && <p className="catalog-description whitespace-pre-line">{person.item.description}</p>}
        <button type="button" className="catalog-cta mt-6" onClick={() => {
          onClose(); onChoose(person.kind, { id: person.item.id, name: person.item.name });
        }}>Записаться</button>
      </div>
    </div>
  </ModalDialog>;
}

export function HorsesAndTrainersSection({ horses, trainers, onChoose }: {
  horses: PublicHorse[]; trainers: PublicTrainer[]; onChoose: ChooseBooking;
}) {
  const [tab, setTab] = useState<'horses' | 'trainers'>('horses');
  const [selected, setSelected] = useState<Person | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const people: Person[] = tab === 'horses' ? horses.map(item => ({ kind: 'horse', item })) : trainers.map(item => ({ kind: 'trainer', item }));
  function close() { setSelected(null); trigger.current?.focus({ preventScroll: true }); }
  return <section id="horses-trainers" className="bg-[#E4DAD0] px-4 py-20 sm:px-10 sm:py-28 lg:px-16" aria-labelledby="team-heading">
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div><p className="text-sm text-[#724C39]">Команда клуба</p>
          <h2 id="team-heading" className="mt-3 font-serif text-4xl font-normal tracking-tight text-[#3A2F2B] sm:text-6xl">Лошади и наставники</h2>
        </div>
        <div className="catalog-switch" role="group" aria-label="Каталог команды">
          <button type="button" aria-pressed={tab === 'horses'} onClick={() => setTab('horses')}>Лошади клуба</button>
          <button type="button" aria-pressed={tab === 'trainers'} onClick={() => setTab('trainers')}>Тренеры</button>
        </div>
      </div>
      <div className="mt-10 grid min-w-0 grid-cols-1 items-stretch gap-6 md:grid-cols-2 lg:grid-cols-3">
        {people.map(person => <article key={person.item.id} className="catalog-card">
          <button type="button" className="catalog-open" aria-haspopup="dialog" onClick={event => {
            trigger.current = event.currentTarget; setSelected(person);
          }}>
            <CatalogPhoto src={person.item.imageUrl} alt="" />
            <div className="catalog-body">
              <h3 className="catalog-title line-clamp-2">{person.item.name}</h3>
              <CatalogBadges labels={badges(person).slice(0, 3)} />
              {person.item.description && <p className="catalog-description line-clamp-3">{person.item.description}</p>}
              <span className="catalog-details mt-auto pt-4">Подробнее<span className="sr-only">: {person.item.name}</span> →</span>
            </div>
          </button>
          <div className="px-6 pb-6 sm:px-7">
            <button type="button" className="catalog-cta w-full" onClick={() => onChoose(person.kind, { id: person.item.id, name: person.item.name })}>
              Выбрать<span className="sr-only">: {person.item.name}</span>
            </button>
          </div>
        </article>)}
      </div>
    </div>
    {selected && <CatalogDialog person={selected} onClose={close} onChoose={onChoose} />}
  </section>;
}
