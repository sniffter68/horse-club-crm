import React from 'react';
import { dateTime, type Membership } from './api';

const _h = React.createElement;

export function MembershipCard({ membership, progress = false }: { membership: Membership | null; progress?: boolean }) {
  const remaining = membership?.remainingLessons ?? membership?.remainedLessons ?? 0;
  return <section className="summary membership" aria-label="Мой абонемент">
    {membership ? <>
      <h2>{membership.title}</h2>
      <p>Осталось: {remaining}{progress ? ' / ' : ' из '}{membership.totalLessons}{progress && ' занятий'}</p>
      {progress && <progress className="w-full" aria-label="Остаток занятий" max={Math.max(1, membership.totalLessons)} value={remaining} />}
      <p>Действует до: <time dateTime={membership.validUntil}>{dateTime(membership.validUntil, true)}</time></p>
      {membership.isExpiringSoon && <p className="badge">Абонемент скоро закончится</p>}
    </> : <p>У вас нет активного абонемента. Оформите его у администратора.</p>}
  </section>;
}
