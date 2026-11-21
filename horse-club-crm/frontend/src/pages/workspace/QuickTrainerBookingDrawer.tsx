import { useEffect, useRef, useState } from 'react'
import { Alert, App, Button, ConfigProvider, DatePicker, Drawer, Empty, Input, Spin, Tag } from 'antd'
import type { InputRef } from 'antd'
import ruRU from 'antd/locale/ru_RU'
import dayjs from 'dayjs'
import { DateTime } from 'luxon'
import { isUuid } from '../../uuid'
import { toHttpError } from '../../httpClient'
import { TmaApiError } from '../../tma/api'
import { entryDrawerTheme } from '../../components/entryDrawerTheme'
import { useQuickBookingPermissions } from './useQuickBookingPermissions'
import { bookingZone, defaultQuickService, quickHorseReason, quickOverlaps, quickRequest, quickSlots, type QuickClient, type QuickContext } from './quickTrainerBooking'
import './quick-trainer-booking.css'

const steps = ['Дата', 'Время', 'Клиент', 'Лошадь']
const failureText = (cause: unknown) => cause instanceof Error ? cause.message : toHttpError(cause).message

export interface QuickTrainerBookingDrawerProps {
  initialDate: string; initialTime?: string; initialTrainerId?: string; ownTrainerId: string
  tmaToken?: string; onClose: () => void; onSaved: (startTime: string) => void; onExpired?: () => void
}

export function QuickTrainerBookingDrawer({ initialDate, initialTime, initialTrainerId, ownTrainerId, tmaToken, onClose, onSaved, onExpired }: QuickTrainerBookingDrawerProps) {
  const { message } = App.useApp()
  const [step, setStep] = useState(0)
  const [date, setDate] = useState(initialDate)
  const [selectedTime, setTime] = useState(initialTime ?? '')
  const [trainerId, setTrainerId] = useState(initialTrainerId ?? ownTrainerId)
  const [client, setClient] = useState<QuickClient>()
  const [horseId, setHorseId] = useState<string>()
  const [horseChosen, setHorseChosen] = useState(false)
  const [contextState, setContextState] = useState<{ key: string; data?: QuickContext; error?: string }>()
  const [clients, setClients] = useState<QuickClient[]>([])
  const [query, setQuery] = useState('')
  const [composing, setComposing] = useState(false)
  const [newClient, setNewClient] = useState(false)
  const [name, setName] = useState(''), [phone, setPhone] = useState('')
  const [error, setError] = useState(''), [searchError, setSearchError] = useState('')
  const [searching, setSearching] = useState(true), [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0)
  const lock = useRef(false), searchInput = useRef<InputRef>(null), heading = useRef<HTMLHeadingElement>(null)
  const [trigger] = useState(() => document.activeElement instanceof HTMLElement ? document.activeElement : null)
  useEffect(() => () => { requestAnimationFrame(() => { if (trigger?.isConnected) trigger.focus() }) }, [trigger])
  const contextKey = `${date}:${revision}`
  const loading = contextState?.key !== contextKey
  const context = !loading ? contextState?.data : undefined
  const contextError = !loading ? contextState?.error : undefined
  const service = context && defaultQuickService(context.services)
  const duration = service?.durationMinutes ?? 60
  const slots = context ? quickSlots(context, date, duration) : []
  const activeTrainer = context?.permissions.lessonCreateAny ? trainerId : ownTrainerId
  const now = DateTime.now().setZone(bookingZone).toMillis()
  const time = slots.includes(selectedTime) ? selectedTime : slots.find(value => {
    const at = `${date}T${value}:00+03:00`
    return +new Date(at) >= now && !context?.entries.some(row => row.trainerId === activeTrainer && quickOverlaps(row, at, duration))
  }) ?? ''
  const start = `${date}T${time || '09:00'}:00+03:00`
  const overlaps = context?.entries.filter(row => quickOverlaps(row, start, duration)) ?? []
  const arenaId = context?.arenas.find(arena => !overlaps.some(row => row.arenaId === arena.id))?.id
  const selectedHorse = context?.horses.find(row => row.id === horseId)
  const horseReason = horseId ? selectedHorse && context ? quickHorseReason(selectedHorse, context.entries, start, duration) : 'Недоступна' : undefined

  useEffect(() => {
    const controller = new AbortController()
    void quickRequest<QuickContext>(`context?date=${encodeURIComponent(date)}`, tmaToken, controller.signal).then(data => {
      if (!controller.signal.aborted) setContextState({ key: contextKey, data })
    }).catch((cause: unknown) => { if (!controller.signal.aborted) { setContextState({ key: contextKey, error: failureText(cause) }); if (cause instanceof TmaApiError && cause.status === 401) onExpired?.() } })
    return () => controller.abort()
  }, [date, tmaToken, contextKey, onExpired])

  useEffect(() => { if (step === 2 && !newClient) searchInput.current?.focus(); else heading.current?.focus() }, [step, newClient])
  useEffect(() => {
    if (step !== 2 || composing) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setSearching(true); setSearchError('')
      void quickRequest<QuickClient[]>(`clients?search=${encodeURIComponent(query)}`, tmaToken, controller.signal)
        .then(value => { if (!controller.signal.aborted) setClients(value) })
        .catch((cause: unknown) => { if (!controller.signal.aborted) setSearchError(failureText(cause)) })
        .finally(() => { if (!controller.signal.aborted) setSearching(false) })
    }, query ? 300 : 0)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [query, step, composing, tmaToken, revision])

  async function createClient() {
    if (lock.current) return
    if (!name.trim() || phone.replace(/\D/g, '').length < 10) { setError('Введите имя и телефон (не менее 10 цифр)'); return }
    lock.current = true; setBusy(true); setError('')
    try {
      const value = await quickRequest<QuickClient>('clients/quick', tmaToken, undefined, { name: name.trim(), phone: phone.trim() })
      setClient(value); setNewClient(false); setStep(3)
    } catch (cause: unknown) { setError(failureText(cause)); if (cause instanceof TmaApiError && cause.status === 401) onExpired?.() }
    finally { lock.current = false; setBusy(false) }
  }
  async function save() {
    if (lock.current || !context || !service || !client || !horseChosen || horseReason || !slots.includes(time)) return
    const ids = [activeTrainer, service.id, client.id, ...(horseId ? [horseId] : []), ...(arenaId ? [arenaId] : [])]
    if (ids.some(id => !isUuid(id))) { setError('Выберите корректные записи из справочников'); return }
    lock.current = true; setBusy(true); setError('')
    try {
      await quickRequest('lessons', tmaToken, undefined, { trainerId: activeTrainer, clientId: client.id, horseId, serviceId: service.id, durationMinutes: duration, arenaId, startTime: start })
      void message.success('Запись создана'); window.dispatchEvent(new Event('lesson-created')); onSaved(start)
    } catch (cause: unknown) { setError(failureText(cause)); if (cause instanceof TmaApiError && cause.status === 401) onExpired?.(); setRevision(value => value + 1) }
    finally { lock.current = false; setBusy(false) }
  }
  return <ConfigProvider locale={ruRU} componentDisabled={busy} theme={{ ...entryDrawerTheme, token: { ...entryDrawerTheme.token, controlHeight: 48, controlHeightLG: 48 } }}><Drawer open placement="bottom" height="min(88dvh, 760px)" title="Записать клиента" onClose={() => { if (!lock.current) onClose() }} closable={busy ? false : { 'aria-label': 'Закрыть запись' }} maskClosable={!busy} keyboard={!busy}
    className="entry-drawer quick-trainer-booking" footer={<div className="quick-booking-footer">
      {step > 0 && <Button disabled={busy} onClick={() => { setStep(step - 1); setError('') }}>Назад</Button>}
      <Button type="primary" block loading={busy} disabled={loading || !context || !service || (step === 1 && !slots.includes(time)) || (step === 2 && !client) || (step === 3 && (!client || !horseChosen || Boolean(horseReason)))} onClick={() => step === 3 ? void save() : setStep(step + 1)}>{step === 3 ? 'Создать занятие' : 'Далее'}</Button>
    </div>}>
    <nav className="quick-booking-progress" aria-label="Шаги записи">{steps.map((label, index) => <span key={label} aria-current={step === index ? 'step' : undefined}>{index + 1}. {label}</span>)}</nav>
    <h2 ref={heading} tabIndex={-1}>{steps[step]}</h2>
    {(error || contextError) && <Alert type="error" showIcon message={error || contextError} action={<Button onClick={() => { heading.current?.focus(); setError(''); setRevision(value => value + 1) }}>Повторить</Button>} />}
    {loading && <Spin aria-label="Загрузка доступности" />}
    {context && !service && <Alert type="warning" message="Нет подходящей услуги. Попросите администратора настроить справочник." />}
    {context?.permissions.lessonCreateAny && <div className="quick-booking-trainers" role="group" aria-label="Тренер">{context.trainers.map(row => <Button key={row.id} aria-pressed={trainerId === row.id} type={trainerId === row.id ? 'primary' : 'default'} disabled={busy} onClick={() => { setTrainerId(row.id); setTime('') }}>{row.name || row.fullName}</Button>)}</div>}
    {step > 0 && <p>{DateTime.fromISO(date, { zone: bookingZone }).setLocale('ru').toFormat('d MMMM')} · {time} МСК{client ? ` · ${client.name}` : ''}</p>}
    {step === 0 && <><div className="quick-booking-dates">{['Сегодня', 'Завтра', 'Послезавтра'].map((label, index) => {
      const value = DateTime.now().setZone(bookingZone).plus({ days: index }).toISODate()!
      return <Button key={label} aria-pressed={date === value} type={date === value ? 'primary' : 'default'} onClick={() => { setDate(value); setTime(''); setHorseChosen(false) }}>{label}</Button>
    })}</div><label htmlFor="quick-booking-date">Другая дата</label><DatePicker id="quick-booking-date" value={dayjs(date).locale('ru')} allowClear={false} onChange={value => { if (value) { setDate(value.format('YYYY-MM-DD')); setTime(''); setHorseChosen(false) } }} /></>}
    {step === 1 && <><p>Занятость выбранного тренера отмечена. Параллельную запись проверим при сохранении.</p><div className="quick-booking-slots">{slots.map(value => {
      const occupied = context?.entries.some(row => row.trainerId === activeTrainer && quickOverlaps(row, `${date}T${value}:00+03:00`, duration))
      return <Button key={value} aria-pressed={time === value} type={time === value ? 'primary' : 'default'} onClick={() => { setTime(value); setHorseChosen(false) }}>{value}{occupied && <span className="quick-booking-busy">Занят</span>}</Button>
    })}</div>{!loading && !slots.length && <Empty description="На эту дату нет рабочих слотов. Выберите другой день." />}</>}
    {step === 2 && <><label htmlFor="quick-client-search">Имя или телефон</label><Input id="quick-client-search" ref={searchInput} allowClear value={query} onChange={event => { setSearching(true); setQuery(event.target.value) }} onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)} />
      <Button block onClick={() => { setNewClient(!newClient); setError('') }}>+ Новый клиент</Button>
      {newClient && <form noValidate onSubmit={event => { event.preventDefault(); void createClient() }} className="quick-booking-client-form">
        <label htmlFor="quick-client-name">Имя</label><Input id="quick-client-name" autoFocus autoComplete="name" value={name} maxLength={150} onChange={event => setName(event.target.value)} disabled={busy} />
        <label htmlFor="quick-client-phone">Телефон</label><Input id="quick-client-phone" type="tel" autoComplete="tel" value={phone} maxLength={40} onChange={event => setPhone(event.target.value)} disabled={busy} />
        <Button htmlType="submit" loading={busy}>Создать и выбрать</Button>
      </form>}
      {searchError && <Alert type="error" message={searchError} action={<Button onClick={() => setRevision(value => value + 1)}>Повторить</Button>} />}
      {searching ? <Spin aria-label="Поиск клиентов" /> : !searchError && <div className="quick-booking-cards">{clients.map(row => <Button key={row.id} aria-pressed={client?.id === row.id} onClick={() => { setClient(row); setStep(3) }}><strong>{row.name}</strong><span>{row.phone}</span></Button>)}{!clients.length && <Empty description="Клиенты не найдены. Создайте нового клиента." />}</div>}</>}
    {step === 3 && <><p>{service?.title || service?.name} · {duration} мин. · {context?.arenas.find(row => row.id === arenaId)?.name || 'Манеж назначим позже'}</p><div className="quick-booking-cards">
      <Button aria-pressed={horseChosen && !horseId} type={horseChosen && !horseId ? 'primary' : 'default'} onClick={() => { setHorseId(undefined); setHorseChosen(true) }}>Без лошади (назначить позже)</Button>
      {context?.horses.map(horse => { const reason = quickHorseReason(horse, context.entries, start, duration)
        return <Button key={horse.id} disabled={Boolean(reason) || loading} aria-pressed={horseId === horse.id} type={horseId === horse.id ? 'primary' : 'default'} onClick={() => { setHorseId(horse.id); setHorseChosen(true) }}><strong>{horse.name}</strong><span>{horse.usedMinutes} / {horse.maxDailyMinutes} мин.</span><Tag className={`crm-tag crm-tag--${reason ? 'warning' : 'success'}`}>{reason || 'Доступна'}</Tag></Button>
      })}</div>{horseReason && <Alert type="warning" message="Лошадь больше недоступна. Выберите другую или назначьте позже." />}</>}
  </Drawer></ConfigProvider>
}

export function QuickTrainerBookingAction({ date, ownTrainerId, tmaToken, onSaved, onExpired }: { date: string; ownTrainerId: string; tmaToken: string; onSaved: (start: string) => void; onExpired?: () => void }) {
  const permissions = useQuickBookingPermissions(tmaToken)
  const [open, setOpen] = useState(false)
  if (!permissions?.lessonCreateAny && !(permissions?.lessonCreateOwn && ownTrainerId)) return null
  return <><Button type="primary" block size="large" onClick={() => setOpen(true)}>+ Записать клиента</Button>{open && <QuickTrainerBookingDrawer initialDate={date} ownTrainerId={ownTrainerId} tmaToken={tmaToken} onExpired={onExpired} onClose={() => setOpen(false)} onSaved={start => { setOpen(false); onSaved(start) }} />}</>
}
