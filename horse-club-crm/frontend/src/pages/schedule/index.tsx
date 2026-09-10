import { useCallback, useEffect, useRef, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import luxonPlugin from '@fullcalendar/luxon3'
import ruLocale from '@fullcalendar/core/locales/ru'
import { Alert, App, Button, Card, Descriptions, Form, Input, InputNumber, Modal, Popconfirm, Progress, Select, Space, Spin, Tag, Typography } from 'antd'
import { useOnError } from '@refinedev/core'
import { API_URL, httpClient, toHttpError } from '../../httpClient'
import { useCatalogPermissions } from '../catalogs/permissions'
import type { Client, Horse, Service, Trainer } from '../catalogs/types'
import { CLUB_TIME_ZONE, formatTime, toInstant, toLocalInput } from './time'
import { statuses, type BookingValues, type ClubSchedule, type Lesson, type Status, type Workload } from './types'

async function catalog<T>(resource: string, signal: AbortSignal): Promise<T[]> {
  const records: T[] = []
  for (let start = 0; ; start += 100) {
    const response = await httpClient.get<T[]>(`${API_URL}/${resource}`, { signal, params: { _start: start, _end: start + 100 } })
    records.push(...response.data)
    if (response.data.length < 100 || records.length >= Number(response.headers['x-total-count'])) return records
  }
}
const personName = (client: Client) => [client.firstName, client.lastName].filter(Boolean).join(' ') || client.name || client.id

export function SchedulePage() {
  const { canManage } = useCatalogPermissions()
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
  const [ready, setReady] = useState(false)
  const [revision, setRevision] = useState(0)
  const [range, setRange] = useState<{ from: string; to: string }>()
  const [trainerId, setTrainerId] = useState<string>()
  const [horseId, setHorseId] = useState<string>()
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [loading, setLoading] = useState(false)
  const [bookingOpen, setBookingOpen] = useState(false)
  const [detail, setDetail] = useState<Lesson>()
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [form] = Form.useForm<BookingValues>()
  const selectedHorse = Form.useWatch('horseId', form) as string | undefined
  const selectedStart = Form.useWatch('startTime', form) as string | undefined
  const duration = Form.useWatch('durationMinutes', form) as number | undefined
  const [workload, setWorkload] = useState<Workload>()
  const [workloadLoading, setWorkloadLoading] = useState(false)
  const [workloadError, setWorkloadError] = useState<string>()

  useEffect(() => {
    const controller = new AbortController()
    // Catalog options must not remain editable while refreshed from the server.
    // oxlint-disable-next-line react/set-state-in-effect
    setReady(false)
    Promise.all([
      httpClient.get<ClubSchedule>(`${API_URL}/settings/club-schedule`, { signal: controller.signal }),
      catalog<Client>('clients', controller.signal), catalog<Horse>('horses', controller.signal),
      catalog<Trainer>('trainers', controller.signal), catalog<Service>('services', controller.signal),
    ]).then(([settings, clientRows, horseRows, trainerRows, serviceRows]) => {
      if (controller.signal.aborted) return
      setSchedule(settings.data); setClients(clientRows); setHorses(horseRows); setTrainers(trainerRows); setServices(serviceRows); setReady(true)
    }).catch(cause => { if (!controller.signal.aborted) report(cause) })
    return () => controller.abort()
  }, [report, revision])

  useEffect(() => {
    if (!range) return
    const controller = new AbortController()
    // Synchronize the loading indicator with this abortable request.
    // oxlint-disable-next-line react/set-state-in-effect
    setLoading(true)
    httpClient.get<Lesson[]>(`${API_URL}/lessons`, { signal: controller.signal, params: { ...range, trainerId, horseId } })
      .then(response => { if (!controller.signal.aborted) setLessons(response.data) })
      .catch(cause => { if (!controller.signal.aborted) { setLessons([]); report(cause) } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [range, trainerId, horseId, revision, report])

  useEffect(() => {
    // Invalidate the previous horse/date result before requesting the next one.
    // oxlint-disable-next-line react/set-state-in-effect
    setWorkload(undefined); setWorkloadError(undefined)
    if (!bookingOpen || !selectedHorse || !selectedStart) { setWorkloadLoading(false); return }
    const controller = new AbortController()
    setWorkloadLoading(true)
    httpClient.get<Workload>(`${API_URL}/horses/${selectedHorse}/workload`, { signal: controller.signal, params: { date: selectedStart.slice(0, 10) } })
      .then(response => { if (!controller.signal.aborted) setWorkload(response.data) })
      .catch(cause => { if (!controller.signal.aborted) { setWorkloadError(toHttpError(cause).message); if (toHttpError(cause).statusCode === 401) report(cause) } })
      .finally(() => { if (!controller.signal.aborted) setWorkloadLoading(false) })
    return () => controller.abort()
  }, [bookingOpen, selectedHorse, selectedStart, revision, report])

  function openBooking(start: Date, minutes = 60) {
    if (!canManage || !ready || savingRef.current) return
    form.resetFields()
    form.setFieldsValue({ startTime: toLocalInput(start), durationMinutes: minutes, trainerId, horseId })
    setError(undefined); setBookingOpen(true)
  }
  async function createBooking(values: BookingValues) {
    if (savingRef.current) return
    savingRef.current = true; setSaving(true); setError(undefined)
    try {
      await httpClient.post<Lesson>(`${API_URL}/lessons`, { ...values, startTime: toInstant(values.startTime) })
      setBookingOpen(false); setRevision(value => value + 1); void message.success('Занятие создано')
    } catch (cause) { report(cause) }
    finally { savingRef.current = false; setSaving(false) }
  }
  async function changeStatus(status: Exclude<Status, 'SCHEDULED'>) {
    if (!detail || savingRef.current) return
    savingRef.current = true; setSaving(true); setError(undefined)
    try {
      const response = await httpClient.patch<Lesson>(`${API_URL}/lessons/${detail.id}/status`, { status })
      setDetail(response.data); setLessons(rows => rows.map(row => row.id === response.data.id ? response.data : row))
      setRevision(value => value + 1); void message.success('Статус обновлён')
    } catch (cause) { report(cause) }
    finally { savingRef.current = false; setSaving(false) }
  }
  const trainerOptions = trainers.map(row => ({ value: row.id, label: row.name }))
  const horseOptions = horses.map(row => ({ value: row.id, label: row.name, disabled: row.isUnavailable }))
  const failure = error ? <Alert type="error" showIcon message={error} /> : null
  return <Space direction="vertical" size="middle" style={{ width: '100%' }}>
    <Typography.Title level={2}>Расписание занятий</Typography.Title>
    <Typography.Text type="secondary">Часовой пояс клуба: {CLUB_TIME_ZONE}</Typography.Text>
    {failure}
    <Space wrap>
      <Select aria-label="Фильтр по тренеру" placeholder="Все тренеры" allowClear showSearch optionFilterProp="label" style={{ width: 240 }} options={trainerOptions} value={trainerId} onChange={setTrainerId} />
      <Select aria-label="Фильтр по лошади" placeholder="Все лошади" allowClear showSearch optionFilterProp="label" style={{ width: 240 }} options={horseOptions.map(option => ({ ...option, disabled: false }))} value={horseId} onChange={setHorseId} />
      <Button onClick={() => { setError(undefined); setRevision(value => value + 1) }}>Обновить</Button>
      {canManage && <Button type="primary" disabled={!ready} onClick={() => openBooking(new Date())}>Новое занятие</Button>}
    </Space>
    <Space wrap>{Object.entries(statuses).map(([status, item]) => <Tag key={status} color={item.color}>{item.label}</Tag>)}</Space>
    <Card><Spin spinning={loading || (!ready && !error)}>
      {schedule && <FullCalendar plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin, luxonPlugin]} locale={ruLocale}
        timeZone={CLUB_TIME_ZONE} initialView="timeGridWeek" headerToolbar={{ left: 'prev,next today', center: 'title', right: 'timeGridWeek,timeGridDay' }}
        buttonText={{ today: 'Сегодня', week: 'Неделя', day: 'День' }} firstDay={1} allDaySlot={false} nowIndicator height="auto"
        slotMinTime={schedule.openTime} slotMaxTime={schedule.closeTime} hiddenDays={[schedule.dayOfWeekOff]}
        selectable={canManage && ready} selectMirror selectOverlap={false} eventDisplay="block"
        datesSet={({ start, end }) => setRange(previous => previous?.from === start.toISOString() && previous.to === end.toISOString() ? previous : { from: start.toISOString(), to: end.toISOString() })}
        select={({ start, end, view }) => { openBooking(start, Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000))); view.calendar.unselect() }}
        events={lessons.map(lesson => ({ id: lesson.id, title: `${lesson.service.title || lesson.service.name} · ${lesson.trainer.name} · ${lesson.horse.name}`, start: lesson.startTime, end: lesson.endTime, backgroundColor: statuses[lesson.status].color, borderColor: statuses[lesson.status].color }))}
        eventClick={({ event }) => { setError(undefined); setDetail(lessons.find(lesson => lesson.id === event.id)) }} />}
    </Spin></Card>
    <Modal title="Быстрое бронирование" open={bookingOpen} onCancel={() => { if (!saving) setBookingOpen(false) }} footer={null} forceRender>
      {failure}
      <Form form={form} layout="vertical" onFinish={createBooking} disabled={saving}>
        <Form.Item name="clientId" label="Клиент" rules={[{ required: true, message: 'Выберите клиента' }]}><Select showSearch optionFilterProp="label" options={clients.map(row => ({ value: row.id, label: personName(row) }))} /></Form.Item>
        <Form.Item name="serviceId" label="Услуга" rules={[{ required: true, message: 'Выберите услугу' }]}><Select showSearch optionFilterProp="label" options={services.map(row => ({ value: row.id, label: row.title || row.name }))} onChange={id => form.setFieldsValue({ durationMinutes: services.find(row => row.id === id)?.durationMinutes })} /></Form.Item>
        <Form.Item name="trainerId" label="Тренер" rules={[{ required: true, message: 'Выберите тренера' }]}><Select showSearch optionFilterProp="label" options={trainerOptions} /></Form.Item>
        <Form.Item name="horseId" label="Лошадь" rules={[{ required: true, message: 'Выберите лошадь' }]}><Select showSearch optionFilterProp="label" options={horseOptions} /></Form.Item>
        <Form.Item name="startTime" label="Время начала" rules={[{ required: true }, { validator: (_, value: string) => { try { toInstant(value); return Promise.resolve() } catch (cause) { return Promise.reject(cause) } } }]}><Input type="datetime-local" /></Form.Item>
        <Form.Item name="durationMinutes" label="Длительность, мин" rules={[{ required: true }, { type: 'integer', min: 1 }]}><InputNumber min={1} precision={0} /></Form.Item>
        {workloadLoading && <Spin size="small" />}
        {workloadError && <Alert type="error" message={workloadError} />}
        {workload && <div aria-live="polite"><Typography.Text>Доступно: {workload.remainingMinutes} из {workload.maxDailyMinutes} мин</Typography.Text><Progress percent={workload.maxDailyMinutes > 0 ? Math.min(100, Math.round(workload.usedMinutes / workload.maxDailyMinutes * 100)) : 100} />{(duration ?? 0) > workload.remainingMinutes && <Alert type="warning" message="Длительность превышает доступную нагрузку лошади" />}</div>}
        <Button type="primary" htmlType="submit" loading={saving} disabled={!ready || workloadLoading || !workload || (duration ?? 0) > workload.remainingMinutes}>Создать занятие</Button>
      </Form>
    </Modal>
    <Modal title="Карточка занятия" open={Boolean(detail)} onCancel={() => { if (!saving) setDetail(undefined) }} footer={null}>
      {failure}
      {detail && <Space direction="vertical" style={{ width: '100%' }}>
        <Tag color={statuses[detail.status].color}>{statuses[detail.status].label}</Tag>
        <Descriptions column={1} items={[
          { key: 'service', label: 'Услуга', children: detail.service.title || detail.service.name },
          { key: 'start', label: 'Начало', children: formatTime(detail.startTime) },
          { key: 'end', label: 'Окончание', children: formatTime(detail.endTime) },
          { key: 'trainer', label: 'Тренер', children: detail.trainer.name },
          { key: 'horse', label: 'Лошадь', children: detail.horse.name },
          { key: 'clients', label: 'Участники', children: detail.bookings.length ? detail.bookings.map(booking => personName(booking.client)).join(', ') : 'Нет участников' },
        ]} />
        <Space wrap>
          <Button disabled={saving || detail.status === 'CANCELLED' || detail.status === 'COMPLETED'} onClick={() => void changeStatus('COMPLETED')}>Отметить присутствие</Button>
          <Button disabled={saving || detail.status === 'CANCELLED' || detail.status === 'NO_SHOW'} onClick={() => void changeStatus('NO_SHOW')}>Неявка</Button>
          <Popconfirm title="Отменить занятие?" description="Списанные занятия абонемента будут возвращены." okText="Да" cancelText="Нет" onConfirm={() => changeStatus('CANCELLED')}><Button danger disabled={saving || detail.status === 'CANCELLED'}>Отменить занятие</Button></Popconfirm>
        </Space>
      </Space>}
    </Modal>
  </Space>
}
