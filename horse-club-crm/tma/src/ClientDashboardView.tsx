import React, { useRef, useState } from 'react';
import { api, dateTime, requireUuid, upcoming, type ClientDashboard, type Booking } from './api';
import { MembershipCard } from './MembershipCard';

const _h = React.createElement;

export function ClientDashboardView({ data, onBook, onRefresh, history = false }: { data: ClientDashboard; onBook: () => void; onRefresh: () => void; history?: boolean }) {
  const [busy, setBusy] = useState('');
  const [cancelId, setCancelId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const pending = useRef(false);
  const rows = data.bookings ?? (data.nextBooking ? [data.nextBooking] : []);
  const isFuture = (row: Booking) => new Date(row.lesson?.startTime ?? row.startTime).getTime() > Date.now();
  const groups = history ? [{ title: 'Предстоящие тренировки', rows: rows.filter(isFuture) }, { title: 'Прошедшие тренировки', rows: rows.filter(row => !isFuture(row)) }] : [{ title: 'Ближайшие тренировки', rows }];
  async function act(row: Booking, action: 'confirm' | 'cancel') {
    if (pending.current) return;
    pending.current = true; setBusy(row.id); setError('');
    try {
      await api(`client/lessons/${requireUuid(row.id)}/${action}`, { method: 'POST' });
      setCancelId(''); setNotice(action === 'cancel' ? 'Занятие отменено. Списанное посещение возвращено на абонемент.' : 'Занятие подтверждено');
      onRefresh();
    } catch (failure: unknown) { setError(failure instanceof Error ? failure.message : 'Не удалось сохранить. Повторите попытку'); }
    finally { pending.current = false; setBusy(''); }
  }
  return <div className="stack mt-4">
    {data.client && <p className="rider-name">{data.client.name || `${data.client.firstName} ${data.client.lastName}`}</p>}
    <MembershipCard membership={data.membership} progress />
    <button className="primary w-full" onClick={onBook}>+ Записаться на тренировку</button>
    <section className="stack" aria-label={history ? 'Мои тренировки' : 'Предстоящие занятия'}>
      {groups.map(group => <section className="stack" key={group.title} aria-label={group.title}><h2>{group.title}</h2>
      {!history && rows.length === 0 && <p>Предстоящих тренировок пока нет. Выберите удобное время для занятия.</p>}
      {group.rows.map(row => <article className="summary" key={row.id}>
        <h2>{row.lesson?.service?.title || row.lesson?.service?.name || 'Тренировка'}</h2>
        <p>{dateTime(row.lesson?.startTime ?? row.startTime)}</p>
        <p>Тренер: {row.trainer?.name || 'Уточнит администратор'}</p>
        <p>Лошадь: {row.horse?.name || 'Уточнит администратор'}</p>
        <span className="badge">{row.status.startsWith('cancelled') || row.lesson?.status === 'CANCELLED' ? 'Отменена' : row.status === 'completed' || row.lesson?.status === 'COMPLETED' ? 'Завершено' : row.clientConfirmed ? 'Подтверждена' : 'Ожидает подтверждения'}</span>
        {upcoming(row) && <div className="stack mt-4">
          {!row.clientConfirmed && <button className="primary" disabled={Boolean(busy)} onClick={() => void act(row, 'confirm')}>{busy === row.id ? 'Сохраняем…' : 'Подтвердить'}</button>}
          {cancelId === row.id ? <div className="stack" aria-label="Подтверждение отмены">
            <p>Отменить тренировку {dateTime(row.startTime)}? Списанное посещение вернётся на абонемент.</p>
            <button autoFocus className="quiet" disabled={Boolean(busy)} onClick={() => setCancelId('')}>Оставить запись</button>
            <button className="quiet danger" disabled={Boolean(busy)} onClick={() => void act(row, 'cancel')}>Подтвердить отмену</button>
          </div> : <button className="quiet" disabled={Boolean(busy)} onClick={() => setCancelId(row.id)}>Отменить</button>}
        </div>}
      </article>)}
      </section>)}
      {history && rows.length === 0 && <p>Предстоящих тренировок пока нет. Выберите удобное время для занятия.</p>}
    </section>
    {error && <div role="alert">{error}<button className="quiet" onClick={() => { setError(''); onRefresh(); }}>Повторить загрузку</button></div>}
    <p role="status">{notice}</p>
  </div>;
}
