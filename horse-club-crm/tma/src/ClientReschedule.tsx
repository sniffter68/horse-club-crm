import { useEffect, useRef, useState } from 'react';
import { api, moscowDate, requireUuid } from './api';

interface Slot { startTime: string; available: boolean }

export function ClientReschedule({ bookingId, onClose, onSaved }: { bookingId: string; onClose: () => void; onSaved: () => void }) {
  const [date, setDate] = useState(moscowDate());
  const [time, setTime] = useState('');
  const [slots, setSlots] = useState<Slot[]>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const lock = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    setTime(''); setSlots(undefined); setError('');
    void api<{ slots: Slot[] }>(`client/lessons/${requireUuid(bookingId)}/reschedule-slots?date=${date}`, { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setSlots(result.slots); })
      .catch((failure: unknown) => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Не удалось загрузить время'); });
    return () => controller.abort();
  }, [bookingId, date, retry]);
  async function save() {
    if (lock.current || !time || !slots?.some(slot => slot.available && slot.startTime === time)) return;
    lock.current = true; setBusy(true); setError('');
    try {
      await api(`client/lessons/${requireUuid(bookingId)}/reschedule`, { method: 'POST', body: JSON.stringify({ date, startTime: time }) });
      onSaved();
    } catch (failure: unknown) { setError(failure instanceof Error ? failure.message : 'Не удалось перенести занятие'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section className="stack mt-4" aria-label="Перенос занятия">
    <h3>Перенести занятие</h3>
    <p>Услуга, тренер и лошадь сохранятся. Списание с абонемента не повторяется.</p>
    <label htmlFor="client-move-date">Новая дата</label>
    <input autoFocus id="client-move-date" type="date" value={date} min={moscowDate()} max={moscowDate(30)} disabled={busy} onChange={event => { if (event.target.value) setDate(event.target.value); }} />
    <div className="row"><button className="quiet" disabled={busy} onClick={() => setDate(moscowDate())}>Сегодня</button><button className="quiet" disabled={busy} onClick={() => setDate(moscowDate(1))}>Завтра</button></div>
    <label htmlFor="client-move-time">Время по Москве</label>
    {!slots && !error && <p role="status">Ищем свободное время…</p>}
    {slots && (slots.length ? <select id="client-move-time" disabled={busy} value={time} onChange={event => setTime(event.target.value)}><option value="">Выберите время</option>{slots.filter(slot => slot.available).map(slot => <option key={slot.startTime} value={slot.startTime}>{slot.startTime}</option>)}</select>
      : <p role="status">Свободного времени нет. Выберите другой день.</p>)}
    {error && <div role="alert">{error}<button className="quiet" disabled={busy} onClick={() => setRetry(value => value + 1)}>Обновить свободное время</button></div>}
    <button className="primary" disabled={busy || !time || !slots} onClick={() => void save()}>{busy ? 'Переносим…' : 'Подтвердить перенос'}</button>
    <button className="quiet" disabled={busy} onClick={onClose}>Оставить прежнее время</button>
  </section>;
}
