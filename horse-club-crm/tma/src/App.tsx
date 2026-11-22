import React, { useEffect, useRef, useState } from 'react';
import { api, setClientSession, dateTime, money, moscowDate, requireUuid, time, upcoming, type Booking, type MyBookingsResponse, type Service, type Slot } from './api';
import { ClientDashboardView } from './ClientDashboardView';
import { ClientBookingCatalog } from './ClientBookingCatalog';
import type { BootstrapResponse, ClientDashboard, ClientOverview } from './api';
import { applyTheme, waitForTelegram, canRequestContact, haptic, telegram, telegramRequiredError, withTelegram } from './telegram';
import { useTelegramNavigation } from './useTelegramNavigation';

const _h = React.createElement;

const ADDRESS = 'Тамбов, ул. Бастионная, 22АС2';
type Screen = 'loading' | 'link' | 'dashboard' | 'catalog' | 'slots' | 'checkout' | 'success' | 'my-bookings';
const titles: Record<Screen, string> = { loading: 'Кабинет клуба', link: 'Привязка кабинета', dashboard: 'Кабинет всадника', catalog: 'Время для лошадей', slots: 'Когда приедете?', checkout: 'Всё готово к записи', success: 'Ждём вас в клубе', 'my-bookings': 'Мои записи' };
const errorText = (error: unknown): string => error instanceof Error ? error.message : 'Не удалось загрузить. Повторите попытку';
const serviceTitle = (service: Service): string => service.title || service.name;
const bookingTitle = (booking: Booking): string => booking.lesson?.service?.title || booking.lesson?.service?.name || 'Занятие в клубе';

export function App() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [dashboard, setDashboard] = useState<ClientDashboard>();
  const [linked, setLinked] = useState(false);
  const [home, setHome] = useState<'catalog' | 'dashboard'>('catalog');
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
  const [staffUrl, setStaffUrl] = useState('');
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
  const refresh = () => setRetry(value => value + 1);
  const reportError = (failure: unknown) => setError(errorText(failure));


  useEffect(() => {
    const requireLink = () => { setLinked(false); setScreen('link'); };
    window.addEventListener('tma:phone-link-required', requireLink);
    return () => window.removeEventListener('tma:phone-link-required', requireLink);
  }, []);

  useEffect(() => {
    applyTheme();
    withTelegram(app => app.ready());
    withTelegram(app => app.expand());
    withTelegram(app => app.onEvent('themeChanged', applyTheme));
    withTelegram(app => app.onEvent('safeAreaChanged', applyTheme));
    withTelegram(app => app.onEvent('contentSafeAreaChanged', applyTheme));
    return () => withTelegram(app => { app.offEvent('themeChanged', applyTheme); app.offEvent('safeAreaChanged', applyTheme); app.offEvent('contentSafeAreaChanged', applyTheme); });
  }, [tg]);

  useEffect(() => {
    withTelegram(app => {
      if (screen === 'checkout') app.enableClosingConfirmation(); else app.disableClosingConfirmation();
    });
    document.title = titles[screen];
    heading.current?.focus();
  }, [screen, tg]);

  useEffect(() => {
    const controller = new AbortController();
    const reportFailure = (failure: unknown) => { if (!controller.signal.aborted) reportError(failure); };
    if (!['loading', 'dashboard', 'catalog', 'slots'].includes(screen)) return;
    setLoading(true); setError('');
    if (screen === 'loading' || screen === 'dashboard') {
      const loadDashboard = async () => {
        const app = await waitForTelegram(controller.signal);
        controller.signal.throwIfAborted();
        if (!app?.initData) throw telegramRequiredError();
        const bootstrap = screen === 'loading' ? await api<BootstrapResponse>('bootstrap', {
          method: 'POST', body: JSON.stringify({ initData: app.initData }), signal: controller.signal,
        }) : undefined;
        if (bootstrap?.role === 'UNLINKED_CLIENT') {
          setClientSession(null); setLinked(false); setScreen('link');
          return undefined;
        }
        if (bootstrap && bootstrap.role !== 'CLIENT') {
          // Telegram's SDK reads the signed launch parameters again in the separate staff bundle.
          const target = `/tma/trainer${window.location.search}${window.location.hash}`;
          setStaffUrl(target);
          window.location.replace(target);
          return undefined;
        }
        if (bootstrap) { setClientSession(bootstrap.token); setLinked(Boolean(bootstrap.clientId)); }
        const isLinked = bootstrap ? Boolean(bootstrap.clientId) : linked;
        let result: ClientDashboard;
        if (isLinked) {
          const overview = await api<ClientOverview>('client/overview', { signal: controller.signal });
          result = { ...overview, isEstablished: true, nextBooking: overview.bookings.find(item => upcoming(item)) ?? null };
        } else result = await api<ClientDashboard>('dashboard', { signal: controller.signal });
        return { result, linked: isLinked };
      };
      loadDashboard()
        .then(data => {
          if (controller.signal.aborted || !data) return;
          const { result, linked } = data;
          setDashboard(result);
          if (result.client?.phone) setPhone(result.client.phone);
          const target = linked || result.isEstablished || screen === 'dashboard' ? 'dashboard' : 'catalog';
          setHome(target);
          if (screen === 'loading') setScreen(target);
        })
        .catch(reportFailure)
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    } else if (screen === 'catalog') {
      api<{ services: Service[]; consentVersion: string }>('services', { signal: controller.signal })
        .then(result => { setServices(result.services); setConsentVersion(result.consentVersion); })
        .catch(reportFailure)
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    } else if (slotServiceId) {
      setSlots([]); setSlot(undefined); setTrainerId('');
      api<{ slots: Slot[] }>(`slots?date=${day}&serviceId=${requireUuid(slotServiceId)}`, { signal: controller.signal })
        .then(result => { if (!controller.signal.aborted) setSlots(result.slots); })
        .catch(reportFailure)
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }
    return () => controller.abort();
  }, [screen, day, slotServiceId, retry]);

  const navigate = (next: Screen) => { if (!submitting.current) { haptic(); setError(''); setScreen(next); } };
  const newBooking = () => {
    setBooking(undefined); setService(undefined); setSlot(undefined); setTrainerId(''); setConsent(false);
    requestId.current = ''; navigate('catalog');
  };
  const back = screen === 'loading' || screen === 'link' || screen === home ? undefined : () => navigate(screen === 'checkout' ? 'slots' : screen === 'slots' ? 'catalog' : home);
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
    } catch (failure: unknown) { reportError(failure); }
    finally { submitting.current = false; setBusy(false); }
  }

  if (screen === 'loading') return <main className="mx-auto max-w-xl px-5" aria-busy={!error}>
    {error ? <div role="alert"><h1>Не удалось открыть кабинет</h1><p>{error}</p>
      {staffUrl ? <a className="primary mt-4" href={staffUrl}>Открыть кабинет персонала</a>
        : <button className="primary mt-4" onClick={refresh}>Повторить</button>}</div>
      : <p role="status">Загружаем личный кабинет…</p>}
  </main>;
  if (screen === 'link') return <main className="mx-auto max-w-xl px-5">
    <h1>{titles.link}</h1><p>Поделитесь телефоном +7… в чате бота.</p>
    <button className="primary mt-4" disabled={busy} onClick={async () => {
      if (submitting.current) return;
      submitting.current = true; setBusy(true); setError('');
      try { await api('client/request-contact', { method: 'POST' }); setContactNotice('Отправьте свой контакт в чат бота.'); }
      catch (failure: unknown) { reportError(failure); }
      finally { submitting.current = false; setBusy(false); }
    }}>Привязать по телефону</button>
    <p role="status">{contactNotice}</p>{error && <p role="alert">{error}</p>}
    <button className="quiet mt-4" disabled={busy} onClick={() => { setClientSession(null); setScreen('loading'); }}>Проверить привязку</button>
  </main>;

  return <main className="mx-auto max-w-xl px-5">
    <header className="mb-6 flex items-center justify-between gap-3">
      <span className="club-mark" aria-label="КСК СЛКС">СЛКС<span>КОННЫЙ КЛУБ · ТАМБОВ</span></span>
      <button className="quiet" disabled={busy || screen === 'my-bookings'} onClick={() => navigate('my-bookings')}>Мои записи</button>
    </header>
    {back && !native && <button className="quiet mb-4" disabled={busy} onClick={back}>← Назад</button>}
    <p className="eyebrow">{screen === 'catalog' ? 'В седле — ближе к природе' : screen === 'slots' ? 'Шаг 2 из 3' : screen === 'checkout' ? 'Шаг 3 из 3' : 'КСК «СЛКС»'}</p>
    <h1 ref={heading} tabIndex={-1}>{titles[screen]}</h1>
    {screen === 'dashboard' && dashboard && <ClientDashboardView data={dashboard} onBook={newBooking} onRefresh={refresh} />}
    {screen === 'catalog' && <ClientBookingCatalog services={services} serviceId={service?.id} format={format}
      loading={loading} error={error} onFormat={value => { setFormat(value); setService(undefined); }} onSelect={setService} />}
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
      <p className="notice">Свободная лошадь назначается при записи. Детали уточнит клуб.</p>
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
    <div className="feedback" aria-live="polite">{loading && <p role="status">{screen === 'dashboard' ? 'Загружаем личный кабинет…' : 'Проверяем свободные места…'}</p>}
      {error && <div role="alert"><p>{error}</p>{screen !== 'checkout' && <button className="quiet mt-2" onClick={refresh}>Повторить загрузку</button>}</div>}
    </div>
    {text && !native && <button className="primary w-full" disabled={!enabled} onClick={next}>{busy ? 'Сохраняем запись…' : text}</button>}
    <footer className="hint mt-4"><p>{ADDRESS}</p><a href="tel:+79156720030">+7 (915) 672-00-30</a></footer>
  </main>;
}

export function MyBookings({ onBook }: { onBook: () => void }) {
  const [data, setData] = useState<MyBookingsResponse>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    api<MyBookingsResponse>(`my-bookings?offset=${offset}&limit=20`, { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setData(previous => ({ ...result, bookings: offset ? [...(previous?.bookings ?? []), ...result.bookings] : result.bookings })); })
      .catch((failure: unknown) => { if (!controller.signal.aborted) setError(errorText(failure)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [offset, retry]);
  const refresh = () => { setOffset(0); setRetry(value => value + 1); };
  return <section className="stack mt-4" aria-label="Список записей">
    {data && <ClientDashboardView data={{ ...data, membership: data.membership ?? null, isEstablished: true, nextBooking: null }} history onBook={onBook} onRefresh={refresh} />}
    {loading && <p role="status">Загружаем ваши записи…</p>}
    {error && <div role="alert"><p>{error}</p><button className="quiet mt-2" onClick={refresh}>Обновить записи</button></div>}
    {data?.hasMore && <button className="quiet w-full" disabled={loading} onClick={() => setOffset(data.bookings.length)}>Загрузить ещё</button>}
  </section>;
}
