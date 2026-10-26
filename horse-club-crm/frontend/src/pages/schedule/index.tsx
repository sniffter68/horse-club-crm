import { LessonDrawer, type LessonDrawerProps } from './LessonDrawer'
import { ScheduleConflictNotice } from './ScheduleConflictNotice'
import { scheduleConflicts } from './triad'
import { useScheduleConflicts } from './useScheduleConflicts'
import { ServiceCancellationAction } from '../../components/ServiceCancellationAction'
import { ScheduleEventContent } from './ScheduleEventContent'
import { DeleteLessonAction } from './DeleteLessonAction'
import { eventSummary } from './scheduleEventPresentation'
import { BookingDateTimeInput } from '../../components/BookingDateTimePicker'
import { EntryOverlay } from '../../components/EntryOverlay'
import { LessonGroupBadge, LessonGroupSummary, CompleteLessonModal, LessonPaymentBadge } from './LessonPayments'
import { ReplaceHorseAction } from './ReplaceHorseAction'
import { HorseIssues } from './HorseIssues'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DateTime } from 'luxon'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import luxonPlugin from '@fullcalendar/luxon3'
import ruLocale from '@fullcalendar/core/locales/ru'
import { Alert, App, Button, Card, Descriptions, Form, Grid, Input, InputNumber, Modal, Select, Space, Spin, Tag, Typography } from 'antd'
import { useOnError } from '@refinedev/core'
import { API_URL, httpClient, toHttpError } from '../../httpClient'
import { useCatalogPermissions } from '../catalogs/permissions'
import type { Arena, Client, Horse, Service, Trainer } from '../catalogs/types'
import { CLUB_TIME_ZONE, formatTime, toInstant, toLocalInput } from './time'
import { statuses, type BookingValues, type ClubSchedule, type Lesson, type Status } from './types'
import { HorseWorkloadBadge, HorseWorkloadList } from './workload'
import { useHorseWorkloads } from './useHorseWorkloads'
import { TriadBookingModal } from './TriadBookingModal'
import { ResourceSchedule, type ResourceGrouping } from './ResourceSchedule'
import { bookingStatusLabels, clientName as personName, dayBounds, disciplines, scheduleEntries, type ScheduleEntry, type TriadBooking, type TriadValues } from './triad'
import { useTriadAvailability } from './useTriadAvailability'
import { BookingLifecycleActions } from './BookingLifecycleActions'
import { catalog } from '../catalogs/loadCatalog'

export function SchedulePage() {
  const screens = Grid.useBreakpoint()
  const compactLayout = !screens.md
  const { canManage } = useCatalogPermissions('schedule')
  const { message } = App.useApp()
  const { mutate: onError } = useOnError()
  const errorHandler = useRef(onError)
  useEffect(() => { errorHandler.current = onError }, [onError])
  const [error, setError] = useState<string>()
  const report = useCallback((cause: unknown) => {
    const failure = toHttpError(cause)
    setError(failure.message)
    if (failure.statusCode === 401) errorHandler.current(failure)
  }, [])
  const [schedule, setSchedule] = useState<ClubSchedule>()
  const [clients, setClients] = useState<Client[]>([])
  const [horses, setHorses] = useState<Horse[]>([])
  const [trainers, setTrainers] = useState<Trainer[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [arenas, setArenas] = useState<Arena[]>([])
  const [ready, setReady] = useState(false)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const refresh = () => setRevision(value => value + 1)
    window.addEventListener('cash-desk-paid', refresh)
    window.addEventListener('lesson-deleted', refresh)
    window.addEventListener('horse-assignment-changed', refresh)
    window.addEventListener('horse-status-changed', refresh)
    return () => {
      window.removeEventListener('cash-desk-paid', refresh)
      window.removeEventListener('lesson-deleted', refresh)
      window.removeEventListener('horse-assignment-changed', refresh)
      window.removeEventListener('horse-status-changed', refresh)
    }
  }, [])
  const [range, setRange] = useState<{ from: string; to: string }>()
  const [trainerId, setTrainerId] = useState<string>()
  const [horseId, setHorseId] = useState<string>()
  const [arenaId, setArenaId] = useState<string>()
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [triadBookings, setTriadBookings] = useState<TriadBooking[]>([])
  const [triadLoading, setTriadLoading] = useState(false)
  const [triadError, setTriadError] = useState<string>()
  const [grouping, setGrouping] = useState<ResourceGrouping>('calendar')
  const [triadSeed, setTriadSeed] = useState<Partial<TriadValues>>()
  const [editingTriad, setEditingTriad] = useState<TriadBooking>()
  const [triadDetail, setTriadDetail] = useState<TriadBooking>()
  const [triadLifecycleBusy, setTriadLifecycleBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [lessonSeed, setLessonSeed] = useState<Partial<LessonDrawerProps>>()
  const [bookingOpen, setBookingOpen] = useState(false)
  const [editingLesson, setEditingLesson] = useState<Lesson>()
  const calendarRef = useRef<FullCalendar>(null)
  const [workloadDate, setWorkloadDate] = useState(() => toLocalInput(new Date()).slice(0, 10))
  const [workloadRevision, setWorkloadRevision] = useState(0)
  const dayRange = dayBounds(workloadDate)
  const triadAvailability = useTriadAvailability(dayRange.from, dayRange.to, revision + workloadRevision, report)
  const entries = useMemo(() => scheduleEntries(lessons, triadBookings), [lessons, triadBookings])
  const [workloadOpen, setWorkloadOpen] = useState(false)
  const [detail, setDetail] = useState<Lesson>()
  const [completing, setCompleting] = useState<Lesson>()
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [form] = Form.useForm<BookingValues>()
  const selectedTrainer = Form.useWatch('trainerId', form) as string | undefined
  const selectedStart = Form.useWatch('startTime', form) as string | undefined
  const duration = Form.useWatch('durationMinutes', form) as number | undefined
  const dayWorkloads = useHorseWorkloads([workloadDate, ...lessons.map(lesson => toLocalInput(new Date(lesson.startTime)).slice(0, 10))], revision + workloadRevision, report)
  const bookingDate = selectedStart?.slice(0, 10) ?? ''
  const bookingWorkloads = useHorseWorkloads(bookingOpen ? [bookingDate] : [], revision + workloadRevision, report, editingLesson?.id)
  const bookingLoads = bookingWorkloads.byDate[bookingDate] ?? []
  const selectedHorseIds = (editingLesson?.bookings ?? []).map(booking => booking.horse?.id).filter((id): id is string => Boolean(id))
  let conflictFrom: string | undefined, conflictTo: string | undefined
  try {
    if (bookingOpen && selectedStart && duration) {
      conflictFrom = toInstant(selectedStart)
      conflictTo = new Date(+new Date(conflictFrom) + duration * 60000).toISOString()
    }
  } catch { /* The date field owns invalid input feedback. */ }
  const conflicts = useScheduleConflicts(conflictFrom, conflictTo, editingLesson?.id)
  const horseBusy = scheduleConflicts(conflicts.entries, selectedTrainer, selectedHorseIds).horses.length > 0
  const workloadBlocked = selectedHorseIds.length > 0 && (bookingWorkloads.loading || Boolean(bookingWorkloads.error) || selectedHorseIds.some(id => {
    const row = bookingLoads.find(item => item.horseId === id)
    return !row || row.status === 'UNAVAILABLE' || row.currentWorkloadMinutes + (duration ?? 0) > row.maxDailyWorkloadMinutes
  }))

  useEffect(() => {
    const controller = new AbortController()
    // Catalog options must not remain editable while refreshed from the server.
    // oxlint-disable-next-line react/set-state-in-effect
    setReady(false)
    Promise.all([
      httpClient.get<ClubSchedule>(`${API_URL}/settings/club-schedule`, { signal: controller.signal }),
      catalog<Client>('clients', controller.signal), catalog<Horse>('horses', controller.signal),
      catalog<Trainer>('trainers', controller.signal), catalog<Service>('services', controller.signal),
      catalog<Arena>('arenas', controller.signal),
    ]).then(([settings, clientRows, horseRows, trainerRows, serviceRows, arenaRows]) => {
      if (controller.signal.aborted) return
      setSchedule(settings.data); setClients(clientRows); setHorses(horseRows); setTrainers(trainerRows); setServices(serviceRows); setArenas(arenaRows); setReady(true)
    }).catch(cause => { if (!controller.signal.aborted) report(cause) })
    return () => controller.abort()
  }, [report, revision])

  useEffect(() => {
    if (!range) return
    const controller = new AbortController()
    // Synchronize the loading indicator with this abortable request.
    // oxlint-disable-next-line react/set-state-in-effect
    setLoading(true)
    httpClient.get<Lesson[]>(`${API_URL}/lessons`, { signal: controller.signal, params: { ...range, trainerId, horseId, arenaId } })
      .then(response => { if (!controller.signal.aborted) setLessons(response.data) })
      .catch(cause => { if (!controller.signal.aborted) { setLessons([]); report(cause) } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [range, trainerId, horseId, arenaId, revision, report])

  useEffect(() => {
    if (!range) return
    const controller = new AbortController()
    void Promise.resolve().then(async () => {
      if (controller.signal.aborted) return
      setTriadLoading(true); setTriadError(undefined)
      try {
        const rows = await catalog<TriadBooking>('bookings', controller.signal, { ...range, trainerId, horseId, arenaId })
        if (!controller.signal.aborted) setTriadBookings(rows)
      } catch (cause) {
        if (controller.signal.aborted) return
        const error = toHttpError(cause)
        setTriadBookings([]); setTriadError(error.message)
        if (error.statusCode === 401) report(cause)
      } finally { if (!controller.signal.aborted) setTriadLoading(false) }
    })
    return () => controller.abort()
  }, [range, trainerId, horseId, arenaId, revision, report])

  useEffect(() => { if (grouping === 'calendar') calendarRef.current?.getApi().updateSize() }, [grouping])

  function openTriad(values: Partial<TriadValues> = {}, booking?: TriadBooking) {
    if (!canManage || !ready) return
    const startTime = values.startTime ?? `${workloadDate}T${schedule?.openTime ?? '09:00'}`
    setEditingTriad(booking); setTriadDetail(undefined)
    setTriadSeed({ trainerId, horseId, arenaId, startTime, endTime: DateTime.fromISO(startTime, { zone: CLUB_TIME_ZONE }).plus({ minutes: 60 }).toFormat("yyyy-MM-dd'T'HH:mm"), ...values })
  }
  function openEntry(entry: ScheduleEntry) {
    if (entry.source === 'lesson') { setError(undefined); setDetail(lessons.find(l => l.id === entry.id)) }
    else setTriadDetail(triadBookings.find(b => b.id === entry.id))
  }

  function openBooking(values: Partial<TriadValues> = {}, minutes = 60) {
    if (!canManage || !ready || savingRef.current) return
    setLessonSeed({ initialDateTime: values.startTime ?? `${workloadDate}T${schedule?.openTime ?? '09:00'}`,
      initialTrainerId: values.trainerId ?? trainerId, initialArenaId: values.arenaId ?? arenaId,
      initialHorseId: values.horseId ?? horseId, initialDurationMinutes: minutes })
  }
  async function saveReschedule(values: BookingValues) {
    if (!editingLesson || savingRef.current || horseBusy || conflicts.loading) return
    const hasHorses = selectedHorseIds.length > 0
    if (hasHorses && (bookingWorkloads.loading || bookingWorkloads.error || values.startTime.slice(0, 10) !== bookingDate || selectedHorseIds.some(horseId => {
      const load = bookingLoads.find(row => row.horseId === horseId)
      return !load || load.status === 'UNAVAILABLE' || load.currentWorkloadMinutes + values.durationMinutes > load.maxDailyWorkloadMinutes
    }))) {
      setError('Проверьте нагрузку лошадей: сохранение доступно после загрузки данных и в пределах суточного лимита.')
      return
    }
    savingRef.current = true; setSaving(true); setError(undefined)
    try {
      await httpClient.patch<Lesson>(`${API_URL}/lessons/${editingLesson.id}/reschedule`, { startTime: toInstant(values.startTime), durationMinutes: values.durationMinutes })
      setWorkloadDate(values.startTime.slice(0, 10))
      setBookingOpen(false); setRevision(value => value + 1); void message.success(editingLesson ? 'Занятие перенесено' : 'Занятие создано')
    } catch (cause) { report(cause) }
    finally { savingRef.current = false; setSaving(false) }
  }
  function openReschedule(lesson: Lesson) {
    if (!canManage || !ready || savingRef.current || lesson.status !== 'SCHEDULED') return
    setDetail(undefined)
    setEditingLesson(lesson)
    form.resetFields()
    form.setFieldsValue({ serviceId: lesson.service.id, trainerId: lesson.trainer?.id, arenaId: lesson.arena?.id,
      startTime: toLocalInput(new Date(lesson.startTime)), durationMinutes: Math.round((new Date(lesson.endTime).getTime() - new Date(lesson.startTime).getTime()) / 60000),
      participants: lesson.bookings.map(booking => ({ clientId: booking.client.id, horseId: booking.horse?.id, membershipId: booking.membership?.id })) })
    setError(undefined)
    setBookingOpen(true)
  }
  async function changeStatus(status: Exclude<Status, 'SCHEDULED'>) {
    if (!detail || savingRef.current) return
    savingRef.current = true; setSaving(true); setError(undefined)
    try {
      const response = await httpClient.patch<Lesson>(`${API_URL}/lessons/${detail.id}/status`, { status })
      setDetail(response.data); setLessons(rows => rows.map(row => row.id === response.data.id ? response.data : row))
      setRevision(value => value + 1)
      const membershipWasDebited = status === 'COMPLETED' && response.data.bookings.some(booking => booking.membership)
      void message.success(membershipWasDebited ? 'Явка отмечена. Занятие списано из абонемента' : 'Статус обновлён')
    } catch (cause) { report(cause) }
    finally { savingRef.current = false; setSaving(false) }
  }
  const trainerOptions = trainers.map(row => ({ value: row.id, label: row.name }))
  const horseOptions = horses.map(row => ({ value: row.id, label: row.name, disabled: row.isUnavailable }))
  const arenaOptions = arenas.map(row => ({ value: row.id, label: row.name, disabled: row.isUnavailable }))
  const failure = error ? <Alert type="error" showIcon message={error} /> : null
  return <Space className="schedule-page" direction="vertical" size="middle" style={{ width: '100%' }}>
    {completing && <CompleteLessonModal lesson={completing} onClose={() => { setDetail(completing); setCompleting(undefined) }} onSaved={updated => { setCompleting(undefined); setDetail(updated); setRevision(v => v + 1) }} />}
    <Typography.Title level={2}>Расписание занятий</Typography.Title>
    <Typography.Text type="secondary">Часовой пояс клуба: {CLUB_TIME_ZONE}</Typography.Text>
    {failure}
    <HorseIssues revision={revision} />
    <Space className="schedule-toolbar" wrap>
      <Select aria-label="Фильтр по тренеру" placeholder="Все тренеры" allowClear showSearch optionFilterProp="label" style={{ width: compactLayout ? '100%' : 240 }} options={trainerOptions} value={trainerId} onChange={setTrainerId} />
      <Select aria-label="Фильтр по лошади" placeholder="Все лошади" allowClear showSearch optionFilterProp="label" style={{ width: compactLayout ? '100%' : 240 }} options={horseOptions.map(option => ({ ...option, disabled: false }))} value={horseId} onChange={setHorseId} />
      <Select aria-label="Фильтр по манежу" placeholder="Все манежи" allowClear showSearch optionFilterProp="label" style={{ width: compactLayout ? '100%' : 240 }} options={arenaOptions.map(option => ({ ...option, disabled: false }))} value={arenaId} onChange={setArenaId} />
      <Button onClick={() => { setError(undefined); setRevision(value => value + 1) }}>Обновить</Button>
      <label className="horse-workload-date">Дата нагрузки<Input aria-label="Дата нагрузки" type="date" value={workloadDate} onChange={event => {
        const date = event.target.value
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return
        setWorkloadDate(date); calendarRef.current?.getApi().gotoDate(date)
      }} /></label>
      <Button onClick={() => setWorkloadOpen(true)}>Нагрузка лошадей</Button>
      <Select aria-label="Группировка расписания" value={grouping} style={{ width: compactLayout ? '100%' : 210 }} onChange={setGrouping}
        options={[{ value: 'calendar', label: 'Календарь' }, { value: 'trainers', label: 'По тренерам' }, { value: 'horses', label: 'По лошадям' }, { value: 'arenas', label: 'По локациям' }]} />
      {canManage && <Button type="primary" disabled={!ready} onClick={() => openBooking()}>Записать на тренировку</Button>}
    </Space>
    {(triadError || triadAvailability.error) && <Alert type="error" showIcon message="Не удалось загрузить бронирования или доступность ресурсов" description={triadError || triadAvailability.error}
      action={<Button onClick={() => setRevision(r => r + 1)}>Повторить загрузку</Button>} />}
    {grouping !== 'calendar' && <Space wrap><Button onClick={() => { const next = DateTime.fromISO(workloadDate).minus({ days: 1 }).toISODate()!; setWorkloadDate(next); calendarRef.current?.getApi().gotoDate(next) }}>Предыдущий день</Button>
      <Button onClick={() => { const next = DateTime.fromISO(workloadDate).plus({ days: 1 }).toISODate()!; setWorkloadDate(next); calendarRef.current?.getApi().gotoDate(next) }}>Следующий день</Button></Space>}
    {dayWorkloads.error && <Alert type="error" showIcon message="Не удалось загрузить нагрузку лошадей" description={dayWorkloads.error}
      action={<Button onClick={() => setWorkloadRevision(value => value + 1)}>Повторить</Button>} />}
    <Space wrap>{Object.entries(statuses).map(([status, item]) => <Tag className="status-badge" bordered={false} key={status} style={{ background: item.background, color: item.text }}>{item.label}</Tag>)}</Space>
    <Card className="schedule-calendar"><Spin spinning={loading || triadLoading || (!ready && !error)}>
      {grouping !== 'calendar' && schedule && <ResourceSchedule grouping={grouping} date={workloadDate} schedule={schedule} entries={entries}
        trainers={trainers.filter(t => !trainerId || t.id === trainerId)} horses={horses.filter(h => !horseId || h.id === horseId)} arenas={arenas.filter(a => !arenaId || a.id === arenaId)}
        workloads={triadAvailability.data?.horseWorkloads ?? []} occupancy={triadAvailability.data?.arenaOccupancy} canManage={canManage && ready} onBook={openBooking} onOpen={openEntry} />}
      <div hidden={grouping !== 'calendar'}>
      {schedule && <FullCalendar ref={calendarRef} plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin, luxonPlugin]} locale={ruLocale}
        timeZone={CLUB_TIME_ZONE} initialView={compactLayout ? 'timeGridDay' : 'timeGridWeek'}
        headerToolbar={compactLayout ? { left: 'prev,next', center: 'title', right: 'today' } : { left: 'prev,next today', center: 'title', right: 'timeGridWeek,timeGridDay' }}
        buttonText={{ today: 'Сегодня', week: 'Неделя', day: 'День' }} firstDay={1} allDaySlot={false} nowIndicator height="auto"
        slotMinTime={schedule.openTime} slotMaxTime={schedule.closeTime} hiddenDays={schedule.daysOfWeekOff}
        selectable={canManage && ready} selectMirror selectOverlap={true} slotEventOverlap={false} eventMinHeight={0} eventDisplay="block"
        datesSet={({ start, end, view }) => {
          setRange(previous => previous?.from === start.toISOString() && previous.to === end.toISOString() ? previous : { from: start.toISOString(), to: end.toISOString() })
          setWorkloadDate(toLocalInput(view.calendar.getDate()).slice(0, 10))
        }}
        select={({ start, end, view }) => { openBooking({ startTime: toLocalInput(start) }, Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000))); view.calendar.unselect() }}
        events={entries.map(entry => ({ id: entry.source === 'booking' ? `triad:${entry.id}` : entry.id,
          title: eventSummary(entry), start: entry.startTime, end: entry.endTime,
          backgroundColor: entry.source === 'lesson' ? statuses[entry.status as Status].event : entry.completed ? '#3E5F48' : entry.active ? '#724C39' : '#8C6527',
          borderColor: trainers.find(trainer => trainer.id === entry.trainerId)?.scheduleColor || 'transparent', textColor: '#FFFFFF' }))}
        eventContent={({ event }) => {
          const entry = entries.find(item => (item.source === 'booking' ? `triad:${item.id}` : item.id) === event.id)
          return entry ? <ScheduleEventContent entry={entry} /> : null
        }}
        eventClick={({ event }) => { if (event.id.startsWith('triad:')) { setTriadDetail(triadBookings.find(b => `triad:${b.id}` === event.id)); return } setError(undefined); const lesson = lessons.find(lesson => lesson.id === event.id); setDetail(lesson); if (lesson) setWorkloadDate(toLocalInput(new Date(lesson.startTime)).slice(0, 10)) }} />}
      </div>
    </Spin></Card>
    {lessonSeed && canManage && <LessonDrawer {...lessonSeed} onClose={() => setLessonSeed(undefined)} onSaved={start => {
      setLessonSeed(undefined); setWorkloadDate(start.slice(0, 10)); calendarRef.current?.getApi().gotoDate(start.slice(0, 10)); setRevision(r => r + 1)
    }} />}
    {triadSeed && <TriadBookingModal initial={triadSeed} booking={editingTriad} clients={clients} horses={horses} trainers={trainers} arenas={arenas} report={report}
      onClose={() => setTriadSeed(undefined)} onSaved={start => { setTriadSeed(undefined); setEditingTriad(undefined); setWorkloadDate(start.slice(0, 10)); calendarRef.current?.getApi().gotoDate(start.slice(0, 10)); setRevision(r => r + 1) }} />}
    <Modal open={Boolean(triadDetail)} title="Карточка бронирования" footer={null} keyboard={!triadLifecycleBusy} maskClosable={!triadLifecycleBusy} closable={!triadLifecycleBusy} onCancel={() => { if (!triadLifecycleBusy) setTriadDetail(undefined) }} destroyOnHidden>
      {triadDetail && <Space direction="vertical" style={{ width: '100%' }}><Tag>{bookingStatusLabels[triadDetail.status]}</Tag><Descriptions column={1} items={[
        { key: 'horse', label: 'Лошадь', children: triadDetail.horse.name }, { key: 'trainer', label: 'Тренер', children: triadDetail.trainer.fullName || triadDetail.trainer.name },
        { key: 'client', label: 'Всадник', children: personName(triadDetail.client) }, { key: 'arena', label: 'Локация', children: triadDetail.arena.name },
        { key: 'time', label: 'Интервал', children: `${formatTime(triadDetail.startTime)} — ${formatTime(triadDetail.endTime)}` }, { key: 'discipline', label: 'Дисциплина', children: disciplines[triadDetail.serviceType] },
      ]} />{triadDetail.status === 'scheduled' && new Date(triadDetail.startTime) > new Date() && <ReplaceHorseAction
        bookingId={triadDetail.id} trainerId={triadDetail.trainerId} horseId={triadDetail.horseId} startTime={triadDetail.startTime} endTime={triadDetail.endTime} horses={horses}
        disabled={triadLifecycleBusy || !ready} report={report} onBusyChange={setTriadLifecycleBusy}
        onSaved={() => { setTriadDetail(undefined); setRevision(value => value + 1) }} />}
      {canManage && <BookingLifecycleActions disabled={triadLifecycleBusy} key={triadDetail.id} booking={triadDetail} report={report} onBusyChange={setTriadLifecycleBusy} onSaved={() => { setTriadDetail(undefined); setTriadLifecycleBusy(false); setRevision(r => r + 1) }} />}{canManage && <Button disabled={triadLifecycleBusy || triadDetail.status !== 'scheduled' || !ready} onClick={() => openTriad({ clientId: triadDetail.clientId, horseId: triadDetail.horseId, trainerId: triadDetail.trainerId,
        arenaId: triadDetail.arenaId, membershipId: triadDetail.membershipId ?? undefined, startTime: toLocalInput(new Date(triadDetail.startTime)), endTime: toLocalInput(new Date(triadDetail.endTime)), serviceType: triadDetail.serviceType, costAmount: Number(triadDetail.costAmount) }, triadDetail)}>Редактировать бронирование</Button>}</Space>}
    </Modal>
    <EntryOverlay variant="drawer" title="Перенос занятия" open={bookingOpen} onCancel={() => { if (!saving) setBookingOpen(false) }} footer={null} forceRender width={720} keyboard={!saving} maskClosable={!saving} closable={!saving}>
      {failure}
      <Form form={form} noValidate layout="vertical" onFinish={saveReschedule} disabled={saving}>
        {editingLesson && <><Typography.Paragraph type="secondary">Меняются только время и длительность. Переносимое занятие исключено из текущей нагрузки.</Typography.Paragraph><LessonGroupSummary lesson={editingLesson} /></>}
        <Form.Item name="serviceId" label="Услуга" rules={[{ required: true, message: 'Выберите услугу' }]}><Select disabled={Boolean(editingLesson)} showSearch optionFilterProp="label" options={services.map(row => ({ value: row.id, label: row.title || row.name }))} /></Form.Item>
        <ScheduleConflictNotice entries={conflicts.entries} trainerId={selectedTrainer} horseIds={selectedHorseIds} error={conflicts.error} />
        <Form.Item name="trainerId" label="Тренер" rules={[{ required: true, message: 'Выберите тренера' }]}><Select aria-label="Тренер" disabled={Boolean(editingLesson)} showSearch optionFilterProp="label" options={trainerOptions} /></Form.Item>
        <Form.Item name="arenaId" label="Манеж" extra="Необязательно для выездного или теоретического занятия."><Select disabled={Boolean(editingLesson)} allowClear showSearch optionFilterProp="label" options={arenaOptions} /></Form.Item>
        <Form.Item name="startTime" label="Время начала" rules={[{ required: true }, { validator: (_, value: string) => { try { toInstant(value); return Promise.resolve() } catch (cause) { return Promise.reject(cause) } } }]}><BookingDateTimeInput /></Form.Item>
        <Form.Item name="durationMinutes" label="Длительность, мин" rules={[{ required: true }, { type: 'integer', min: 1 }]}><InputNumber min={1} precision={0} /></Form.Item>
        {bookingWorkloads.error && <Alert type="error" showIcon message="Не удалось проверить нагрузку лошадей" description={bookingWorkloads.error}
          action={<Button onClick={() => setWorkloadRevision(value => value + 1)}>Повторить проверку</Button>} />}
        {workloadBlocked && !bookingWorkloads.loading && !bookingWorkloads.error && <Typography.Paragraph type="danger" role="status">Выбранная лошадь недоступна или суточный лимит будет превышен.</Typography.Paragraph>}
        <Button type="primary" htmlType="submit" aria-label="Сохранить перенос" aria-busy={saving}
          loading={saving} disabled={!ready || workloadBlocked || horseBusy || conflicts.loading} style={{ marginTop: 16 }}>Сохранить перенос</Button>
      </Form>
    </EntryOverlay>
    <Modal title="Карточка занятия" open={Boolean(detail)} keyboard={!saving} maskClosable={!saving} closable={!saving} onCancel={() => { if (!saving) setDetail(undefined) }} footer={null}>
      {failure}
      {detail && <Space direction="vertical" style={{ width: '100%' }}>
        <LessonGroupBadge lesson={detail} /><LessonGroupSummary lesson={detail} /><LessonPaymentBadge lesson={detail} />
        <Tag className="status-badge" bordered={false} style={{ background: statuses[detail.status].background, color: statuses[detail.status].text }}>{statuses[detail.status].label}</Tag>
        <Descriptions column={1} items={[
          { key: 'service', label: 'Услуга', children: detail.service.title || detail.service.name },
          { key: 'start', label: 'Начало', children: formatTime(detail.startTime) },
          { key: 'end', label: 'Окончание', children: formatTime(detail.endTime) },
          { key: 'trainer', label: 'Тренер', children: detail.trainer?.fullName || detail.trainer?.name || 'Без тренера' },
          { key: 'arena', label: 'Манеж', children: detail.arena?.name || 'Не указан' },
          { key: 'clients', label: 'Участники', children: detail.bookings.length ? <Space direction="vertical" size={4}>{detail.bookings.map(booking => <Space key={booking.id} wrap>
            <span>{personName(booking.client)}</span>
            <Tag>{booking.horse?.name || 'Без лошади'}</Tag>
            <HorseWorkloadBadge date={toLocalInput(new Date(detail.startTime)).slice(0, 10)} workload={dayWorkloads.byDate[toLocalInput(new Date(detail.startTime)).slice(0, 10)]?.find(row => row.horseId === booking.horse?.id)} />
            {detail.trainer && detail.status === 'SCHEDULED' && new Date(detail.startTime) > new Date() && <ReplaceHorseAction
              bookingId={booking.id} trainerId={detail.trainer.id} horseId={booking.horse?.id} startTime={detail.startTime} endTime={detail.endTime} horses={horses}
              disabled={saving || !ready} report={report} onBusyChange={busy => { savingRef.current = busy; setSaving(busy) }}
              onSaved={() => { setDetail(undefined); setRevision(value => value + 1) }} />}
            {booking.membership && <Tag color="green">Абонемент: {booking.membership.remainedLessons} / {booking.membership.totalLessons}</Tag>}
          </Space>)}</Space> : 'Нет участников' },
        ]} />
        {canManage && <Space wrap>
          <Button disabled={saving || !ready || detail.status !== 'SCHEDULED'} onClick={() => openReschedule(detail)}>Перенести занятие</Button>
          <Button disabled={saving || detail.status === 'CANCELLED' || detail.status === 'COMPLETED'} onClick={() => { setCompleting(detail); setDetail(undefined) }}>Отметить присутствие</Button>
          <Button disabled={saving || detail.status === 'CANCELLED' || detail.status === 'NO_SHOW'} onClick={() => void changeStatus('NO_SHOW')}>Неявка</Button>
          <ServiceCancellationAction resource="lessons" id={detail.id} label="Отменить занятие" disabled={saving || detail.status === 'CANCELLED'} onChanged={() => setDetail(undefined)} />
          <DeleteLessonAction key={detail.id} lesson={detail} disabled={saving} onBusyChange={busy => { savingRef.current = busy; setSaving(busy) }} onDeleted={() => setDetail(undefined)} />
        </Space>}
      </Space>}
    </Modal>
    <Modal title={`Нагрузка лошадей · ${workloadDate.split('-').reverse().join('.')}`} open={workloadOpen} onCancel={() => setWorkloadOpen(false)} footer={null} width={600} destroyOnHidden>
      <HorseWorkloadList key={workloadDate} rows={triadAvailability.data?.horseWorkloads ?? dayWorkloads.byDate[workloadDate] ?? []} loading={dayWorkloads.loading || triadAvailability.loading}
        error={triadAvailability.error || dayWorkloads.error} onRefresh={() => setWorkloadRevision(value => value + 1)} />
    </Modal>
  </Space>
}
