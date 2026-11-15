import React from 'react';
import { dateTime, type ClientDashboard } from './api';
import { MembershipCard } from './MembershipCard';

const _h = React.createElement;

export function ClientDashboardView({ data, onBook }: { data: ClientDashboard; onBook: () => void }) {
  const { membership, nextBooking } = data;
  return <div className="stack mt-4">
    <MembershipCard membership={membership} progress />
    <section className="summary" aria-label="Ближайшая тренировка">
      <h2>Ближайшая тренировка</h2>
      {nextBooking ? <>
        <p>{dateTime(nextBooking.lesson?.startTime ?? nextBooking.startTime)}</p>
        <p>Тренер: {nextBooking.trainer?.name || 'Уточнит администратор'}</p>
        <span className="badge">{nextBooking.clientCancellationRequested ? 'Запрошена отмена' : nextBooking.clientConfirmed ? 'Подтверждена' : 'Ожидает подтверждения'}</span>
      </> : <p>Предстоящих тренировок пока нет. Выберите удобное время для занятия.</p>}
    </section>
    <button className="primary w-full" onClick={onBook}>+ Записаться на занятие</button>
  </div>;
}
