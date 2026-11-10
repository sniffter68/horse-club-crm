import { useEffect, useRef, useState } from 'react'
import { Alert, App, Button, ConfigProvider, Drawer, Input, Select as AntSelect, Spin, Tag, theme } from 'antd'
import ruRU from 'antd/locale/ru_RU'
import { DateTime } from 'luxon'
import { isUuid } from '../uuid'
import { TmaApiError, tmaRequest, type LessonStatus, type TmaHorse, type TrainerLesson, type TrainerSession } from './api'
import { tmaDay, tmaTime, tmaWeek } from './dates'
import { useTelegramWebApp } from './useTelegramWebApp'
import './trainer.css'

const statuses: Record<LessonStatus, { label: string; color: string }> = {
  SCHEDULED: { label: 'Запланировано', color: 'default' }, COMPLETED: { label: 'Проведено', color: 'success' },
  CANCELLED: { label: 'Отменено', color: 'error' }, NO_SHOW: { label: 'Неявка', color: 'warning' },
}
type Sheet = { kind: 'status' | 'horse'; lesson: TrainerLesson } | null
type DayResult = { lessons: TrainerLesson[]; error?: string }

export function TrainerScheduleView() {
  const { state, dark, retry, expire } = useTelegramWebApp()
  return <ConfigProvider locale={ruRU} theme={{ algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: { colorPrimary: window.Telegram?.WebApp?.themeParams.button_color ?? '#724C39', borderRadius: 12, controlHeight: 44 } }}>
    <App><main className="trainer-tma">
      {state.kind === 'ready' ? state.session.role === 'ADMIN'
        ? <AdminTmaView session={state.session} onExpired={expire} />
        : <TrainerSchedule session={state.session} onExpired={expire} /> : <section className="trainer-gate">
        <img src="/horse-crm.svg" alt="КСК «СЛКС»" width={64} height={64} />
        <p className="trainer-eyebrow">HORSE CLUB · КСК «СЛКС»</p>
        <h1>Кабинет клуба</h1>
        {state.kind === 'loading' ? <div role="status"><Spin aria-label="Вход через Telegram" /><p>Проверяем доступ…</p></div> : <>
          <Alert showIcon type={state.kind === 'error' ? 'error' : 'info'} message={state.kind === 'not-linked'
            ? 'Telegram пока не привязан' : state.kind === 'outside' ? 'Откройте приложение в Telegram' : 'Не удалось войти'}
          description={state.kind === 'not-linked' ? 'Попросите администратора привязать ваш Telegram к учётной записи сотрудника и карточке тренера.'
            : state.kind === 'outside' ? 'Перейдите в бот клуба и откройте расписание тренера.' : state.kind === 'error' ? state.message : undefined} />
          <Button onClick={retry}>Повторить вход</Button>
        </>}
      </section>}
    </main></App>
  </ConfigProvider>
}

export function AdminTmaView({ session, onExpired }: { session: TrainerSession; onExpired: () => void }) {
  const [view, setView] = useState<'admin' | 'trainer'>(() => /^\/tma\/trainer\/?$/.test(window.location.pathname) && session.trainer.trainerId ? 'trainer' : 'admin')
  return <>
    {session.trainer.trainerId && <nav className="trainer-heading-row" aria-label="Режим кабинета">
      <Button type={view === 'admin' ? 'primary' : 'default'} aria-pressed={view === 'admin'} onClick={() => setView('admin')}>Вид администратора</Button>
      <Button type={view === 'trainer' ? 'primary' : 'default'} aria-pressed={view === 'trainer'} onClick={() => setView('trainer')}>Вид тренера</Button>
    </nav>}
    <TrainerSchedule key={view} session={session} onExpired={onExpired} all={view === 'admin'} />
  </>
}

function TrainerSchedule({ session, onExpired, all = false }: { session: TrainerSession; onExpired: () => void; all?: boolean }) {
  const { message } = App.useApp()
  const [date, setDate] = useState(tmaDay)
  const [weekData, setWeekData] = useState<{ key: string; days: Record<string, DayResult> }>({ key: '', days: {} })
  const [revision, setRevision] = useState(0)
  const [sheet, setSheet] = useState<Sheet>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const saving = useRef(false)
  const sheetTrigger = useRef<HTMLElement | null>(null)
  const dayHeading = useRef<HTMLHeadingElement | null>(null)
  const [error, setError] = useState('')
  const [reason, setReason] = useState('')
  const [status, setStatus] = useState<'NO_SHOW' | 'CANCELLED'>('NO_SHOW')
  const [bookingId, setBookingId] = useState<string>()
  const [horseId, setHorseId] = useState<string>()
  const [horses, setHorses] = useState<TmaHorse[]>()
  const [horseRetry, setHorseRetry] = useState(0)
  const weekStart = tmaWeek(date)[0].toISODate()!
  const full = session.accessLevel === 'FULL'
  const requestKey = `${weekStart}:${revision}`
  const days = weekData.key === requestKey ? weekData.days : {}
  useEffect(() => {
    const controller = new AbortController()
    for (const day of tmaWeek(weekStart)) {
      const key = day.toISODate()!
      void tmaRequest<TrainerLesson[]>(`${all ? 'admin/schedule' : 'schedule'}?date=${key}`, session.access_token, { signal: controller.signal })
        .then(lessons => { if (!controller.signal.aborted) setWeekData(current => ({ key: requestKey, days: { ...(current.key === requestKey ? current.days : {}), [key]: { lessons } } })) })
        .catch((failure: unknown) => {
          if (controller.signal.aborted) return
          if (failure instanceof TmaApiError && failure.status === 401) { onExpired(); return }
          setWeekData(current => ({ key: requestKey, days: { ...(current.key === requestKey ? current.days : {}), [key]: { lessons: [], error: failure instanceof Error ? failure.message : 'Не удалось загрузить расписание' } } }))
        })
    }
    return () => controller.abort()
  }, [weekStart, requestKey, session.access_token, onExpired, all])

  useEffect(() => {
    if (!sheetOpen || sheet?.kind !== 'horse') return
    const controller = new AbortController()
    void tmaRequest<TmaHorse[]>('horses', session.access_token, { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setHorses(value) })
      .catch((failure: unknown) => {
        if (controller.signal.aborted) return
        if (failure instanceof TmaApiError && failure.status === 401) onExpired()
        else setError(failure instanceof Error ? failure.message : 'Не удалось загрузить лошадей')
      })
    return () => controller.abort()
  }, [sheetOpen, sheet, horseRetry, session.access_token, onExpired])

  function restoreSheetFocus() {
    if (sheetTrigger.current?.isConnected) sheetTrigger.current.focus()
    else dayHeading.current?.focus()
  }

  function closeSheet() {
    setSheetOpen(false)
    // Escape can cancel the entering animation before Drawer fires afterOpenChange.
    requestAnimationFrame(restoreSheetFocus)
  }

  function openSheet(kind: 'status' | 'horse', lesson: TrainerLesson, trigger: HTMLElement) {
    sheetTrigger.current = trigger
    setReason(''); setError(''); setHorses(undefined); setHorseId(undefined); setStatus('NO_SHOW')
    setBookingId(lesson.participants.length === 1 ? lesson.participants[0].bookingId : undefined)
    setSheet({ kind, lesson })
    setSheetOpen(true)
  }

  async function save(lesson: TrainerLesson, action: 'status' | 'horse', body: object) {
    if (saving.current || !full) return
    if (!isUuid(lesson.id)) { setError('Некорректный идентификатор занятия. Обновите расписание'); return }
    saving.current = true; setBusy(true); setError('')
    try {
      await tmaRequest<{ updated: boolean }>(`lessons/${lesson.id}/${action}`, session.access_token,
        { method: 'PATCH', body: JSON.stringify(body) })
      closeSheet()
      void message.success(action === 'horse' ? 'Лошадь заменена' : 'Статус сохранён')
      setRevision(value => value + 1)
    } catch (failure: unknown) {
      if (failure instanceof TmaApiError && failure.status === 401) onExpired()
      else setError(failure instanceof Error ? failure.message : 'Не удалось сохранить изменения')
    } finally { saving.current = false; setBusy(false) }
  }
  const selected = days[date]
  const title = DateTime.fromISO(date).setLocale('ru').toFormat('d MMMM, cccc')
  return <>
    <header className="trainer-header">
      <p className="trainer-eyebrow">HORSE CLUB · {all ? 'АДМИНИСТРАТОР' : 'ТРЕНЕР'}</p>
      <h1>{session.trainer.name}</h1>
      <div className="trainer-heading-row"><h2>{all ? 'Расписание клуба' : 'Моё расписание'}</h2><Button disabled={busy} onClick={() => setDate(tmaDay())}>Сегодня</Button></div>
      <div className="trainer-week-nav"><Button disabled={busy} aria-label="Предыдущая неделя" onClick={() => setDate(DateTime.fromISO(date).minus({ weeks: 1 }).toISODate()!)}>←</Button>
        <span>{tmaWeek(date)[0].setLocale('ru').toFormat('d MMM')} — {tmaWeek(date)[6].setLocale('ru').toFormat('d MMM')}</span>
        <Button disabled={busy} aria-label="Следующая неделя" onClick={() => setDate(DateTime.fromISO(date).plus({ weeks: 1 }).toISODate()!)}>→</Button></div>
      <nav className="trainer-week" aria-label="Дни недели">{tmaWeek(date).map(day => {
        const key = day.toISODate()!, result = days[key]
        return <button key={key} type="button" disabled={busy} aria-pressed={key === date}
          aria-label={`${day.setLocale('ru').toFormat('cccc, d MMMM')}, занятий: ${result && !result.error ? result.lessons.length : 'не загружено'}`}
          onClick={() => setDate(key)}><span>{day.setLocale('ru').toFormat('ccc')}</span><strong>{day.day}</strong><small>{result && !result.error ? result.lessons.length : '·'}</small></button>
      })}</nav>
    </header>
    <section className="trainer-day" aria-label={title} aria-busy={!selected}>
      <div className="trainer-heading-row"><h2 ref={dayHeading} tabIndex={-1}>{title}</h2><Button disabled={busy} onClick={() => setRevision(value => value + 1)} aria-label="Обновить расписание">↻</Button></div>
      <p className="trainer-muted">Время московское{!full ? ' · Только просмотр' : ''}</p>
      {error && !sheetOpen && <Alert type="error" showIcon message={error} />}
      {!selected ? <div className="trainer-loading"><Spin aria-label="Загрузка расписания" /></div>
        : selected.error ? <Alert type="error" showIcon message="Расписание не загрузилось" description={selected.error}
          action={<Button onClick={() => setRevision(value => value + 1)}>Повторить</Button>} />
        : selected.lessons.length === 0 ? <div className="trainer-empty"><h3>На этот день занятий нет</h3><p>Выберите другой день или обновите расписание.</p></div>
        : <div className="trainer-lessons">{selected.lessons.map(lesson => <article key={lesson.id} className="trainer-lesson">
          <div className="trainer-heading-row"><strong className="trainer-time">{tmaTime(lesson.startTime)} – {tmaTime(lesson.endTime)}</strong>
            <Tag color={statuses[lesson.status].color}>{statuses[lesson.status].label}</Tag></div>
          <h3>{lesson.clientName || 'Участники не назначены'}</h3><p>{lesson.serviceName}</p>
          {all && lesson.trainerName && <p>Тренер: {lesson.trainerName}</p>}
          <div className="trainer-horse"><span><span aria-hidden="true">♞ </span>{lesson.horseName || 'Лошадь не назначена'}</span>
            {full && lesson.status === 'SCHEDULED' && <Button disabled={busy} onClick={event => openSheet('horse', lesson, event.currentTarget)}>Сменить лошадь</Button>}</div>
          {lesson.notes && <p className="trainer-muted">{lesson.notes}</p>}
          {full && lesson.status === 'SCHEDULED' && <div className="trainer-actions">
            <Button className="trainer-complete" disabled={busy} onClick={() => void save(lesson, 'status', { status: 'COMPLETED' })}>Проведено</Button>
            <Button disabled={busy} onClick={event => openSheet('status', lesson, event.currentTarget)}>Неявка / Отмена</Button>
          </div>}
        </article>)}</div>}
    </section>
    <Drawer placement="bottom" height="auto" rootClassName="trainer-sheet" title={sheet?.kind === 'horse' ? 'Сменить лошадь' : 'Статус занятия'}
      open={sheetOpen} onClose={() => { if (!saving.current) closeSheet() }} maskClosable={!busy} keyboard={!busy} closable={busy ? false : { 'aria-label': 'Закрыть' }}
      afterOpenChange={visible => { if (!visible && !sheetOpen) {
        setSheet(null)
        requestAnimationFrame(restoreSheetFocus)
      } }}
      destroyOnHidden footer={<Button type="primary" block loading={busy} disabled={sheet?.kind === 'horse'
        ? !horseId || !bookingId || !horses : !reason.trim()} onClick={() => {
        if (!sheet) return
        if (sheet.kind === 'horse') {
          if (!horseId || !bookingId || !isUuid(horseId) || !isUuid(bookingId)) { setError('Выберите лошадь и участника из списка'); return }
          void save(sheet.lesson, 'horse', { horseId, bookingId })
        } else void save(sheet.lesson, 'status', { status, reason: reason.trim() })
      }}>Сохранить</Button>}>
      {sheet && <div className="trainer-sheet-content">
        <p><strong>{tmaTime(sheet.lesson.startTime)} · {sheet.lesson.clientName}</strong></p>
        {error && <Alert type="error" message={error} showIcon />}
        {sheet.kind === 'horse' ? <>
          <label htmlFor="trainer-participant">Всадник</label>
          <AntSelect virtual={false} id="trainer-participant" value={bookingId} disabled={busy} placeholder="Выберите всадника" onChange={value => { setBookingId(value); setHorseId(undefined) }}
            options={sheet.lesson.participants.map(p => ({ value: p.bookingId, label: `${p.clientName} · ${p.horseName || 'без лошади'}` }))} />
          <label htmlFor="trainer-horse">Лошадь</label>
          <AntSelect virtual={false} id="trainer-horse" value={horseId} disabled={busy || !horses} loading={!horses && !error} placeholder="Выберите лошадь" onChange={setHorseId}
            options={horses?.map(horse => ({ value: horse.id, label: horse.name, disabled: horse.id === sheet.lesson.participants.find(p => p.bookingId === bookingId)?.horseId }))} />
          {error && !horses && <Button onClick={() => { setError(''); setHorses(undefined); setHorseRetry(value => value + 1) }}>Повторить загрузку</Button>}
          {horses?.length === 0 && <p role="status">Активных лошадей нет.</p>}
          <p className="trainer-muted">При сохранении проверим здоровье, нагрузку и занятость лошади. Замена доступна до начала занятия.</p>
        </> : <>
          <label htmlFor="trainer-status">Новый статус</label>
          <AntSelect virtual={false} id="trainer-status" disabled={busy} value={status} onChange={setStatus}
            options={[{ value: 'NO_SHOW', label: 'Неявка' }, { value: 'CANCELLED', label: 'Отмена' }]} />
          <label htmlFor="trainer-reason">Причина</label>
          <Input.TextArea id="trainer-reason" disabled={busy} value={reason} maxLength={300} autoSize={{ minRows: 3, maxRows: 6 }} onChange={event => setReason(event.target.value)} />
          <Alert type="info" showIcon message={status === 'CANCELLED' ? 'Для отмены оплаченного занятия обратитесь к администратору.'
            : 'Неявка учитывается по действующим правилам списания абонемента.'} />
          {sheet.lesson.participants.length > 1 && <Alert type="warning" showIcon message="Статус изменится для всего группового занятия." />}
        </>}
      </div>}
    </Drawer>
  </>
}
