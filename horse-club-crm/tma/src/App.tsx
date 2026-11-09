import React, { useEffect, useRef, useState } from 'react';
import { api, dateTime, money, moscowDate, requireUuid, time, upcoming, type Booking, type Membership, type MyBookingsResponse, type Service, type Slot } from './api';
import { applyTheme, canRequestContact, haptic, telegram, withTelegram } from './telegram';
import { useTelegramNavigation } from './useTelegramNavigation';

const _h = React.createElement;

const ADDRESS = 'Тамбов, ул. Бастионная, 22АС2';
const FORMATS = [
  { label: 'Первое знакомство', pattern: /знаком|перв|начал|нович/i },
  { label: 'Пони для детей', pattern: /пони|дет/i },
  { label: 'Прогулка', pattern: /прогул/i },
  { label: 'Индивидуальная тренировка', pattern: /индивиду|трениров|конкур|выезд/i },
];
type Screen = 'catalog' | 'slots' | 'checkout' | 'success' | 'my-bookings';
const errorText = (error: unknown): string => error instanceof Error ? error.message : 'Не удалось загрузить. Повторите попытку';
const serviceTitle = (service: Service): string => service.title || service.name;
const bookingTitle = (booking: Booking): string => booking.lesson?.service?.title || booking.lesson?.service?.name || 'Занятие в клубе';

export function App() {
  const [screen, setScreen] = useState<Screen>('catalog');
  const [services, setServices] = useState<Service[]>([]);
  const [consentVersion, setConsentVersion] = useState('');
  const [service, setService] = useState<Service>();
  const [format, setFormat] = useState('');
  const [day, setDay] = useState(moscowDate);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slot, setSlot] = useState<Slot>();
  const [trainerId, setTrainerId] = useState('');
  const [phone, setPhone] = useState('');
  const [contactPending, setContactPending] = useState(false);
  const [contactNotice, setContactNotice] = useState('');
  const contactRequest = useRef(false);
  const [consent, setConsent] = useState(false);
  const [booking, setBooking] = useState<Booking>();
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const submitting = useRef(false);
  const requestId = useRef('');
  const heading = useRef<HTMLHeadingElement>(null);
  const phoneInput = useRef<HTMLInputElement>(null);
  const tg = telegram();
  const user = tg?.initDataUnsafe?.user;
  const native = Boolean(tg?.initData);
  const validPhone = /^\+7\d{10}$/.test(phone.replace(/[\s()-]/g, ''));
  const slotServiceId = screen === 'slots' ? service?.id : undefined;
  const displayedServices = format ? services.filter(item => FORMATS.find(entry => entry.label === format)?.pattern.test(serviceTitle(item))) : services;

  useEffect(() => {
    applyTheme();
    withTelegram(app => app.ready());
    withTelegram(app => app.expand());
    withTelegram(app => app.onEvent('themeChanged', applyTheme));
    return () => withTelegram(app => app.offEvent('themeChanged', applyTheme));
  }, [tg]);

  useEffect(() => {
    withTelegram(app => {
      if (screen === 'checkout') app.enableClosingConfirmation(); else app.disableClosingConfirmation();
    });
    document.title = `${({ catalog: 'Выбор занятия', slots: 'Дата и время', checkout: 'Оформление записи', success: 'Запись создана', 'my-bookings': 'Мои записи' })[screen]} · КСК «СЛКС»`;
    heading.current?.focus();
  }, [screen, tg]);

  useEffect(() => {
    const controller = new AbortController();
    if (screen !== 'catalog' && screen !== 'slots') return;
    setLoading(true); setError('');
    if (screen === 'catalog') {
      api<{ services: Service[]; consentVersion: string }>('services', { signal: controller.signal })
        .then(result => { setServices(result.services); setConsentVersion(result.consentVersion); })
        .catch((failure: unknown) => { if (!controller.signal.aborted) setError(errorText(failure)); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    } else if (slotServiceId) {
      setSlots([]); setSlot(undefined); setTrainerId('');
      api<{ slots: Slot[] }>(`slots?date=${day}&serviceId=${requireUuid(slotServiceId)}`, { signal: controller.signal })
        .then(result => { if (!controller.signal.aborted) setSlots(result.slots); })
        .catch((failure: unknown) => { if (!controller.signal.aborted) setError(errorText(failure)); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }
    return () => controller.abort();
  }, [screen, day, slotServiceId, retry]);

  const navigate = (next: Screen) => { if (!submitting.current) { haptic(); setError(''); setScreen(next); } };
  const newBooking = () => {
    setBooking(undefined); setService(undefined); setSlot(undefined); setTrainerId(''); setConsent(false);
    requestId.current = ''; navigate('catalog');
  };
  const back = screen === 'catalog' ? undefined : () => navigate(screen === 'checkout' ? 'slots' : 'catalog');
  const next = () => {
    if (screen === 'catalog' && service) navigate('slots');
    else if (screen === 'slots' && slot) { requestId.current = crypto.randomUUID(); navigate('checkout'); }
    else if (screen === 'checkout') void submit();
  };
  const text = screen === 'catalog' || screen === 'slots' ? 'Далее' : screen === 'checkout' ? 'Подтвердить запись' : undefined;
  const enabled = !loading && !busy && !contactPending && (screen === 'catalog' ? Boolean(service) : screen === 'slots' ? Boolean(slot) : validPhone && consent);
  useTelegramNavigation(text, enabled, busy, next, back);

  function requestPhone(): void {
    if (contactRequest.current || busy || typeof tg?.requestContact !== 'function') return;
    contactRequest.current = true; setContactPending(true); setContactNotice('');
    const fallback = 'Введите номер вручную.';
    try {
      tg.requestContact((ok, response) => {
        contactRequest.current = false; setContactPending(false);
        const value = response?.responseUnsafe?.contact?.phone_number;
        if (ok && typeof value === 'string' && value.trim()) {
          setPhone(value.startsWith('+') ? value : `+${value}`);
          setContactNotice('Номер получен из Telegram.');
        } else { setContactNotice(fallback); phoneInput.current?.focus(); }
      });
    } catch {
      contactRequest.current = false; setContactPending(false);
      setContactNotice(fallback); phoneInput.current?.focus();
    }
  }

  async function submit() {
    if (submitting.current || contactRequest.current || !service || !slot) return;
    if (!validPhone || !consent) { setError('Укажите телефон +79991234567 и подтвердите согласие'); phoneInput.current?.focus(); return; }
    submitting.current = true; setBusy(true); setError('');
    try {
      const result = await api<Booking>('bookings', { method: 'POST', body: JSON.stringify({
        serviceId: requireUuid(service.id), trainerId: requireUuid(trainerId || slot.trainers[0].id),
        startTime: slot.startTime, phone, consentAccepted: true, consentVersion, requestId: requestId.current,
      }) });
      setBooking({ ...result, startTime: result?.startTime ?? slot.startTime,
        trainer: result?.trainer ?? slot.trainers.find(trainer => trainer.id === trainerId) ?? slot.trainers[0],
        lesson: result?.lesson ? { ...result.lesson, service: result.lesson.service ?? service } : {
          status: 'SCHEDULED', deletedAt: null, startTime: slot.startTime, endTime: slot.endTime, service,
        } }); setScreen('success');
    } catch (failure: unknown) { setError(errorText(failure)); }
    finally { submitting.current = false; setBusy(false); }
  }

  const titles: Record<Screen, string> = { catalog: 'Время для лошадей', slots: 'Когда приедете?', checkout: 'Всё готово к записи', success: 'Ждём вас в клубе', 'my-bookings': 'Мои записи' };
  return <main className="mx-auto max-w-xl px-5">
    <header className="mb-6 flex items-center justify-between gap-3">
      <span className="club-mark" aria-label="КСК СЛКС">СЛКС<span>КОННЫЙ КЛУБ · ТАМБОВ</span></span>
      <button className="quiet" disabled={busy || screen === 'my-bookings'} onClick={() => navigate('my-bookings')}>Мои записи</button>
    </header>
    {!native && <p className="notice">Откройте запись через Telegram-бота клуба.</p>}
    {back && !native && <button className="quiet mb-4" disabled={busy} onClick={back}>← Назад</button>}
    <p className="eyebrow">{screen === 'catalog' ? 'В седле — ближе к природе' : screen === 'slots' ? 'Шаг 2 из 3' : screen === 'checkout' ? 'Шаг 3 из 3' : 'КСК «СЛКС»'}</p>
    <h1 ref={heading} tabIndex={-1}>{titles[screen]}</h1>
    {screen === 'catalog' && <>
      <p className="hint mb-6">Выберите занятие — и до встречи в седле.</p>
      <div className="formats mb-4" aria-label="Выбор формата">
        {['Все занятия', ...FORMATS.map(entry => entry.label)].map(label => <button key={label} className="quiet"
          aria-pressed={(format || 'Все занятия') === label} onClick={() => { haptic(); setFormat(label === 'Все занятия' ? '' : label); setService(undefined); }}>{label}</button>)}
      </div>
      <div className="stack" aria-label="Форматы занятий">
        {!loading && !error && services.length === 0 && <p className="notice">Запись закрыта. Телефон: <a href="tel:+79156720030">+7 (915) 672-00-30</a>.</p>}
        {!loading && !error && services.length > 0 && displayedServices.length === 0 && <p className="notice">Нет доступных услуг. Выберите «Все занятия».</p>}
        {displayedServices.map(item => <button key={item.id} className="choice service" aria-pressed={service?.id === item.id}
          disabled={loading} onClick={() => { haptic(); setService(item); }}>
          <span><strong>{serviceTitle(item)}</strong><span className="hint">{item.durationMinutes} мин</span></span>
          <span className="price">{money(item.price)} <span aria-hidden="true">↗</span></span>
        </button>)}
      </div>
    </>}
    {screen === 'slots' && <>
      <p className="hint mb-6">{service && serviceTitle(service)} · Время московское</p>
      <label className="field">День занятия<input type="date" value={day} min={moscowDate()} max={moscowDate(30)}
        onChange={event => { if (event.target.value) { setDay(event.target.value); haptic(); } }} /></label>
      <fieldset className="mt-4"><legend>Свободное время</legend>
        <div className="mt-3 grid grid-cols-3 gap-2">{slots.map(item => <button className="choice slot" key={item.startTime}
          aria-pressed={slot?.startTime === item.startTime} onClick={() => { haptic(); setSlot(item); setTrainerId(''); }}>{time(item.startTime)}</button>)}</div>
      </fieldset>
      {!loading && !error && slots.length === 0 && <p className="notice">Свободного времени нет. Выберите другой день.</p>}
      {slot && <label className="field mt-4">Тренер<select value={trainerId} onChange={event => { haptic(); setTrainerId(event.target.value); }}>
        <option value="">Любой доступный тренер</option>{slot.trainers.map(trainer => <option key={trainer.id} value={trainer.id}>{trainer.name}</option>)}
      </select></label>}
    </>}
    {screen === 'checkout' && <>
      <div className="summary my-5"><strong>{service && serviceTitle(service)}</strong><p>{slot && dateTime(slot.startTime)}</p>
        <p>{slot?.trainers.find(trainer => trainer.id === trainerId)?.name ?? slot?.trainers[0]?.name}</p><p>{service && money(service.price)} · Оплата в клубе</p></div>
      <form noValidate onSubmit={event => { event.preventDefault(); void submit(); }}>
        <label className="field">Ваше имя<input readOnly value={[user?.first_name, user?.last_name].filter(Boolean).join(' ')} /></label>
        {user?.username && <p className="hint mt-2">@{user.username}</p>}
        <label className="field mt-4">Телефон<input ref={phoneInput} type="tel" inputMode="tel" autoComplete="tel" placeholder="+79991234567"
          disabled={busy || contactPending} value={phone} onChange={event => { setPhone(event.target.value); setContactNotice(''); }} aria-describedby="phone-help" aria-invalid={phone.length > 0 && !validPhone} /></label>
        {native && canRequestContact(tg) && <button type="button" className="quiet mt-2" disabled={busy || contactPending}
          onClick={requestPhone}>{contactPending ? 'Ожидаем Telegram…' : '📱 Заполнить из Telegram'}</button>}
        <p className="hint" role="status">{contactNotice}</p>
        <p className="hint mt-2" id="phone-help">Для связи: +79991234567.</p>
        <label className="consent mt-4"><input type="checkbox" checked={consent} disabled={busy} onChange={event => { setConsent(event.target.checked); haptic(); }} />
          <span>Даю <a href="https://club.horseclub68.ru/#consent" target="_blank" rel="noreferrer">согласие на обработку персональных данных</a> для записи в клуб (152-ФЗ). <a href="https://club.horseclub68.ru/#privacy" target="_blank" rel="noreferrer">Политика обработки данных</a>.</span></label>
      </form>
      <p className="notice">Лошадь подберёт администратор. Детали уточнит клуб.</p>
    </>}
    {screen === 'success' && <section className="summary my-5" aria-label="Информация о записи">
      <span className="badge">Заявка принята</span><h2 className="mt-4">{booking ? bookingTitle(booking) : 'Занятие в клубе'}</h2>
      <p>{dateTime(booking?.lesson?.startTime ?? booking?.startTime)}</p><p>Тренер: {booking?.trainer?.name || 'Уточнит администратор'}</p><p>{ADDRESS}</p>
      <p className="hint mt-4" role="status">Заявка принята, администратор свяжется с вами</p>
      <div className="stack mt-4">
        <button className="primary w-full" onClick={() => navigate('my-bookings')}>Мои записи</button>
        <button className="quiet w-full" onClick={newBooking}>Новая запись</button>
      </div>
    </section>}
    {screen === 'my-bookings' && <MyBookings onBook={newBooking} />}
    <div className="feedback" aria-live="polite">{loading && <p role="status">Проверяем свободные места…</p>}
      {error && <div role="alert"><p>{error}</p>{screen !== 'checkout' && <button className="quiet mt-2" onClick={() => setRetry(value => value + 1)}>Повторить загрузку</button>}</div>}
    </div>
    {text && !native && <button className="primary w-full" disabled={!enabled} onClick={next}>{busy ? 'Сохраняем запись…' : text}</button>}
    <footer className="hint mt-4"><p>{ADDRESS}</p><a href="tel:+79156720030">+7 (915) 672-00-30</a></footer>
  </main>;
}

export function MyBookings({ onBook }: { onBook: () => void }) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [membership, setMembership] = useState<Membership | null | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [confirmId, setConfirmId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [retry, setRetry] = useState(0);
  const active = useRef(true);
  const pending = useRef(false);

  async function load(offset: number, signal?: AbortSignal) {
    setLoading(true); setError('');
    try {
      const result = await api<MyBookingsResponse>(`my-bookings?offset=${offset}&limit=20`, { signal });
      if (active.current && !signal?.aborted) { setBookings(previous => offset ? [...previous, ...result.bookings] : result.bookings); setHasMore(result.hasMore); setMembership(result.membership ?? null); }
    } catch (failure: unknown) { if (active.current && !signal?.aborted) setError(errorText(failure)); }
    finally { if (active.current && !signal?.aborted) setLoading(false); }
  }
  useEffect(() => {
    active.current = true;
    const controller = new AbortController(); void load(0, controller.signal);
    return () => { active.current = false; controller.abort(); };
  }, [retry]);

  async function cancel(booking: Booking) {
    if (pending.current) return;
    pending.current = true; setBusy(booking.id); setError(''); haptic();
    try {
      const updated = await api<Booking>(`bookings/${requireUuid(booking.id)}/cancel-request`, { method: 'POST' });
      if (active.current) {
        setBookings(previous => previous.map(item => item.id === updated.id ? updated : item));
        setConfirmId(''); setNotice('Запрос на отмену сохранён. Администратор уточнит условия.');
      }
    } catch (failure: unknown) { if (active.current) setError(errorText(failure)); }
    finally { pending.current = false; if (active.current) setBusy(''); }
  }
  const now = Date.now();
  const isFuture = (booking: Booking) => new Date(booking.lesson?.startTime ?? booking.startTime).getTime() >= now;
  const groups = [
    { title: 'Предстоящие тренировки', rows: bookings.filter(isFuture) },
    { title: 'Прошедшие тренировки', rows: bookings.filter(booking => !isFuture(booking)) },
  ];
  return <section className="stack mt-4" aria-label="Список записей">
    {membership !== undefined && <section className="summary membership" aria-label="Мой абонемент">
      {membership ? <>
        <h2>{membership.title}</h2>
        <p>Осталось: {membership.remainingLessons} из {membership.totalLessons}</p>
        <p>Действует до: <time dateTime={membership.validUntil}>{dateTime(membership.validUntil, true)}</time></p>
        {membership.isExpiringSoon && <p className="badge">Абонемент скоро закончится</p>}
      </> : <p>У вас нет активного абонемента. Оформите его у администратора.</p>}
    </section>}
    {groups.filter(group => group.rows.length > 0).map(group => <section className="stack" key={group.title} aria-label={group.title}>
      <h2>{group.title}</h2>
      {group.rows.map(booking => {
      const cancelled = booking.status === 'cancelled' || booking.lesson?.status === 'CANCELLED' || Boolean(booking.lesson?.deletedAt);
      const status = cancelled ? 'Отменена' : booking.status === 'completed' || booking.lesson?.status === 'COMPLETED' ? 'Завершено'
        : booking.clientCancellationRequested ? 'Запрошена отмена' : booking.clientConfirmed ? 'Подтверждена' : 'Ожидает';
      return <article className="summary" key={booking.id}><span className="badge">{status}</span>
        <h2 className="mt-3">{bookingTitle(booking)}</h2><p>{dateTime(booking.lesson?.startTime ?? booking.startTime)}</p>
        <p>Тренер: {booking.trainer?.name || 'Уточнит администратор'}</p><p className="hint">{ADDRESS}</p>
        {upcoming(booking) && !booking.clientCancellationRequested && (confirmId === booking.id
          ? <div className="mt-4"><p>Запросить отмену? Запись сохранится до решения администратора.</p>
              <div className="mt-3 flex flex-wrap gap-3"><button disabled={Boolean(busy)} className="quiet" onClick={() => setConfirmId('')}>Оставить запись</button>
              <button disabled={Boolean(busy)} className="quiet danger" onClick={() => void cancel(booking)}>{busy === booking.id ? 'Отправляем…' : 'Запросить отмену'}</button></div></div>
          : <button className="quiet mt-4" disabled={Boolean(busy)} onClick={() => { haptic(); setConfirmId(booking.id); }}>Отменить занятие</button>)}
      </article>;
    })}</section>)}
    {loading && <p role="status">Загружаем ваши записи…</p>}
    {!loading && !error && bookings.length === 0 && <div className="notice"><p>У вас пока нет активных записей</p><button className="primary mt-3 w-full" onClick={onBook}>Записаться</button></div>}
    {error && <div role="alert"><p>{error}</p><button className="quiet mt-2" onClick={() => setRetry(value => value + 1)}>Обновить записи</button></div>}
    <p role="status">{notice}</p>
    {hasMore && <button className="quiet w-full" disabled={loading} onClick={() => void load(bookings.length)}>Загрузить ещё</button>}
  </section>;
}
