import { useCallback, useEffect, useRef, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import luxonPlugin from '@fullcalendar/luxon3'
import ruLocale from '@fullcalendar/core/locales/ru'
import { Alert, App, Button, Card, Descriptions, Form, Grid, Input, InputNumber, Modal, Popconfirm, Progress, Select, Space, Spin, Tag, Typography, type FormInstance } from 'antd'
import { useOnError } from '@refinedev/core'
import { API_URL, httpClient, toHttpError } from '../../httpClient'
import { useCatalogPermissions } from '../catalogs/permissions'
import type { Arena, Client, Horse, Service, Trainer } from '../catalogs/types'
import { CLUB_TIME_ZONE, formatTime, toInstant, toLocalInput } from './time'
import { statuses, type BookingParticipantValues, type BookingValues, type ClientWithMemberships, type ClubSchedule, type Lesson, type MembershipSummary, type Status, type Workload } from './types'

async function catalog<T>(resource: string, signal: AbortSignal): Promise<T[]> {
  const records: T[] = []
  for (let start = 0; ; start += 100) {
    const response = await httpClient.get<T[]>(`${API_URL}/${resource}`, { signal, params: { _start: start, _end: start + 100 } })
    records.push(...response.data)
    if (response.data.length < 100 || records.length >= Number(response.headers['x-total-count'])) return records
  }
}
const personName = (client: Client) => [client.firstName, client.lastName].filter(Boolean).join(' ') || client.name || client.id
const membershipDate = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeZone: CLUB_TIME_ZONE })
const lessonHorses = (lesson: Lesson) => [...new Set(lesson.bookings.map(booking => booking.horse?.name).filter((name): name is string => Boolean(name)))]

function ParticipantEditor({ index, form, clients, horses, participants, service, startTime, durationMinutes, canRemove, onRemove, report }: {
  index: number
  form: FormInstance<BookingValues>
  clients: Client[]
  horses: Horse[]
  participants: BookingParticipantValues[]
  service?: Service
  startTime?: string
  durationMinutes?: number
  canRemove: boolean
  onRemove: () => void
  report: (cause: unknown) => void
}) {
  const selectedClient = Form.useWatch(['participants', index, 'clientId'], form) as string | undefined
  const selectedHorse = Form.useWatch(['participants', index, 'horseId'], form) as string | undefined
  const [memberships, setMemberships] = useState<MembershipSummary[]>([])
  const [membershipsLoading, setMembershipsLoading] = useState(false)
  const [membershipsError, setMembershipsError] = useState<string>()
  const [workload, setWorkload] = useState<Workload>()
  const [workloadLoading, setWorkloadLoading] = useState(false)
  const [workloadError, setWorkloadError] = useState<string>()

  useEffect(() => {
    const controller = new AbortController()
    const loadMemberships = async () => {
      await Promise.resolve()
      if (controller.signal.aborted) return
      setMemberships([]); setMembershipsError(undefined)
      if (!selectedClient || !service?.allowMembership) {
        setMembershipsLoading(false)
        form.setFieldValue(['participants', index, 'membershipId'], undefined)
        return
      }
      setMembershipsLoading(true)
      try {
        const response = await httpClient.get<ClientWithMemberships>(`${API_URL}/clients/${selectedClient}`, { signal: controller.signal })
        if (controller.signal.aborted) return
        const active = response.data.memberships
          .filter(membership => membership.isActive)
          .sort((left, right) => new Date(left.validUntil).getTime() - new Date(right.validUntil).getTime())
        setMemberships(active)
        form.setFieldValue(['participants', index, 'membershipId'], active[0]?.id)
      } catch (cause) {
        if (controller.signal.aborted) return
        const failure = toHttpError(cause)
        setMembershipsError(failure.message)
        form.setFieldValue(['participants', index, 'membershipId'], undefined)
        if (failure.statusCode === 401) report(cause)
      } finally {
        if (!controller.signal.aborted) setMembershipsLoading(false)
      }
    }
    void loadMemberships()
    return () => controller.abort()
  }, [form, index, report, selectedClient, service?.allowMembership])

  useEffect(() => {
    const controller = new AbortController()
    // oxlint-disable-next-line react/set-state-in-effect
    setWorkload(undefined); setWorkloadError(undefined)
    if (!selectedHorse || !startTime) { setWorkloadLoading(false); return () => controller.abort() }
    setWorkloadLoading(true)
    httpClient.get<Workload>(`${API_URL}/horses/${selectedHorse}/workload`, { signal: controller.signal, params: { date: startTime.slice(0, 10) } })
      .then(response => { if (!controller.signal.aborted) setWorkload(response.data) })
      .catch(cause => {
        if (!controller.signal.aborted) {
          const failure = toHttpError(cause)
          setWorkloadError(failure.message)
          if (failure.statusCode === 401) report(cause)
        }
      })
      .finally(() => { if (!controller.signal.aborted) setWorkloadLoading(false) })
    return () => controller.abort()
  }, [report, selectedHorse, startTime])

  const selectedClientIds = participants.map(participant => participant?.clientId).filter(Boolean)
  const selectedHorseIds = participants.map(participant => participant?.horseId).filter(Boolean)

  return <Card size="small" title={`Участник ${index + 1}`} extra={<Button danger type="link" disabled={!canRemove} onClick={onRemove}>Удалить</Button>}>
    <Form.Item name={[index, 'clientId']} label="Клиент" rules={[{ required: true, message: 'Выберите клиента' }]}>
      <Select showSearch optionFilterProp="label" options={clients.map(row => ({
        value: row.id, label: personName(row), disabled: row.id !== selectedClient && selectedClientIds.includes(row.id),
      }))} />
    </Form.Item>
    {service?.allowMembership && <Form.Item name={[index, 'membershipId']} label="Абонемент" extra="Активный абонемент с ближайшим сроком окончания выбирается автоматически.">
      <Select allowClear loading={membershipsLoading} placeholder={memberships.length ? 'Выберите абонемент' : 'Активных абонементов нет'} options={memberships.map(membership => ({
        value: membership.id,
        label: `${membership.pricingPlan?.name || 'Абонемент'} · ${membership.remainedLessons} / ${membership.totalLessons} · до ${membershipDate.format(new Date(membership.validUntil))}`,
      }))} />
    </Form.Item>}
    {membershipsError && <Alert type="error" showIcon message="Не удалось загрузить абонементы" description={membershipsError} />}
    <Form.Item name={[index, 'horseId']} label="Лошадь участника" extra="Оставьте пустым для теоретического занятия или занятия без клубной лошади.">
      <Select allowClear showSearch optionFilterProp="label" options={horses.map(row => ({
        value: row.id, label: row.name, disabled: row.isUnavailable || (row.id !== selectedHorse && selectedHorseIds.includes(row.id)),
      }))} />
    </Form.Item>
    {workloadLoading && <Spin size="small" />}
    {workloadError && <Alert type="error" message={workloadError} />}
    {workload && <div aria-live="polite">
      <Typography.Text>Доступно: {workload.remainingMinutes} из {workload.maxDailyMinutes} мин</Typography.Text>
      <Progress percent={workload.maxDailyMinutes > 0 ? Math.min(100, Math.round(workload.usedMinutes / workload.maxDailyMinutes * 100)) : 100} />
      {(durationMinutes ?? 0) > workload.remainingMinutes && <Alert type="warning" message="Длительность превышает доступную нагрузку лошади" />}
    </div>}
  </Card>
}

export function SchedulePage() {
  const screens = Grid.useBreakpoint()
  const compactLayout = !screens.md
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
  const [arenas, setArenas] = useState<Arena[]>([])
  const [ready, setReady] = useState(false)
  const [revision, setRevision] = useState(0)
  const [range, setRange] = useState<{ from: string; to: string }>()
  const [trainerId, setTrainerId] = useState<string>()
  const [horseId, setHorseId] = useState<string>()
  const [arenaId, setArenaId] = useState<string>()
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [loading, setLoading] = useState(false)
  const [bookingOpen, setBookingOpen] = useState(false)
  const [detail, setDetail] = useState<Lesson>()
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [form] = Form.useForm<BookingValues>()
  const selectedService = Form.useWatch('serviceId', form) as string | undefined
  const selectedArena = Form.useWatch('arenaId', form) as string | undefined
  const selectedStart = Form.useWatch('startTime', form) as string | undefined
  const duration = Form.useWatch('durationMinutes', form) as number | undefined
  const participants = Form.useWatch('participants', form) as BookingParticipantValues[] | undefined

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

  function openBooking(start: Date, minutes = 60) {
    if (!canManage || !ready || savingRef.current) return
    form.resetFields()
    form.setFieldsValue({ startTime: toLocalInput(start), durationMinutes: minutes, trainerId, arenaId, participants: [{ horseId }] })
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
      setRevision(value => value + 1)
      const membershipWasDebited = status === 'COMPLETED' && response.data.bookings.some(booking => booking.membership)
      void message.success(membershipWasDebited ? 'Явка отмечена. Занятие списано из абонемента' : 'Статус обновлён')
    } catch (cause) { report(cause) }
    finally { savingRef.current = false; setSaving(false) }
  }
  const trainerOptions = trainers.map(row => ({ value: row.id, label: row.name }))
  const horseOptions = horses.map(row => ({ value: row.id, label: row.name, disabled: row.isUnavailable }))
  const arenaOptions = arenas.map(row => ({ value: row.id, label: row.name, disabled: row.isUnavailable }))
  const selectedServiceRecord = services.find(item => item.id === selectedService)
  const selectedArenaRecord = arenas.find(item => item.id === selectedArena)
  const participantLimit = Math.min(selectedServiceRecord?.maxCapacity ?? 1, selectedArenaRecord?.capacity ?? Number.POSITIVE_INFINITY)
  const failure = error ? <Alert type="error" showIcon message={error} /> : null
  return <Space direction="vertical" size="middle" style={{ width: '100%' }}>
    <Typography.Title level={2}>Расписание занятий</Typography.Title>
    <Typography.Text type="secondary">Часовой пояс клуба: {CLUB_TIME_ZONE}</Typography.Text>
    {failure}
    <Space className="schedule-toolbar" wrap>
      <Select aria-label="Фильтр по тренеру" placeholder="Все тренеры" allowClear showSearch optionFilterProp="label" style={{ width: compactLayout ? '100%' : 240 }} options={trainerOptions} value={trainerId} onChange={setTrainerId} />
      <Select aria-label="Фильтр по лошади" placeholder="Все лошади" allowClear showSearch optionFilterProp="label" style={{ width: compactLayout ? '100%' : 240 }} options={horseOptions.map(option => ({ ...option, disabled: false }))} value={horseId} onChange={setHorseId} />
      <Select aria-label="Фильтр по манежу" placeholder="Все манежи" allowClear showSearch optionFilterProp="label" style={{ width: compactLayout ? '100%' : 240 }} options={arenaOptions.map(option => ({ ...option, disabled: false }))} value={arenaId} onChange={setArenaId} />
      <Button onClick={() => { setError(undefined); setRevision(value => value + 1) }}>Обновить</Button>
      {canManage && <Button type="primary" disabled={!ready} onClick={() => openBooking(new Date())}>Новое занятие</Button>}
    </Space>
    <Space wrap>{Object.entries(statuses).map(([status, item]) => <Tag key={status} color={item.color}>{item.label}</Tag>)}</Space>
    <Card><Spin spinning={loading || (!ready && !error)}>
      {schedule && <FullCalendar plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin, luxonPlugin]} locale={ruLocale}
        timeZone={CLUB_TIME_ZONE} initialView={compactLayout ? 'timeGridDay' : 'timeGridWeek'}
        headerToolbar={compactLayout ? { left: 'prev,next', center: 'title', right: 'today' } : { left: 'prev,next today', center: 'title', right: 'timeGridWeek,timeGridDay' }}
        buttonText={{ today: 'Сегодня', week: 'Неделя', day: 'День' }} firstDay={1} allDaySlot={false} nowIndicator height="auto"
        slotMinTime={schedule.openTime} slotMaxTime={schedule.closeTime} hiddenDays={schedule.daysOfWeekOff}
        selectable={canManage && ready} selectMirror selectOverlap={false} eventDisplay="block"
        datesSet={({ start, end }) => setRange(previous => previous?.from === start.toISOString() && previous.to === end.toISOString() ? previous : { from: start.toISOString(), to: end.toISOString() })}
        select={({ start, end, view }) => { openBooking(start, Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000))); view.calendar.unselect() }}
        events={lessons.map(lesson => ({ id: lesson.id, title: `${lesson.service.title || lesson.service.name} · ${lesson.trainer.name}${lessonHorses(lesson).length ? ` · ${lessonHorses(lesson).join(', ')}` : ''}`, start: lesson.startTime, end: lesson.endTime, backgroundColor: statuses[lesson.status].color, borderColor: statuses[lesson.status].color }))}
        eventClick={({ event }) => { setError(undefined); setDetail(lessons.find(lesson => lesson.id === event.id)) }} />}
    </Spin></Card>
    <Modal title="Быстрое бронирование" open={bookingOpen} onCancel={() => { if (!saving) setBookingOpen(false) }} footer={null} forceRender width={720}>
      {failure}
      <Form form={form} layout="vertical" onFinish={createBooking} disabled={saving}>
        <Form.Item name="serviceId" label="Услуга" rules={[{ required: true, message: 'Выберите услугу' }]}><Select showSearch optionFilterProp="label" options={services.map(row => ({ value: row.id, label: row.title || row.name }))} onChange={id => form.setFieldsValue({ durationMinutes: services.find(row => row.id === id)?.durationMinutes })} /></Form.Item>
        <Form.Item name="trainerId" label="Тренер" rules={[{ required: true, message: 'Выберите тренера' }]}><Select showSearch optionFilterProp="label" options={trainerOptions} /></Form.Item>
        <Form.Item name="arenaId" label="Манеж" extra="Необязательно для выездного или теоретического занятия."><Select allowClear showSearch optionFilterProp="label" options={arenaOptions} /></Form.Item>
        <Form.Item name="startTime" label="Время начала" rules={[{ required: true }, { validator: (_, value: string) => { try { toInstant(value); return Promise.resolve() } catch (cause) { return Promise.reject(cause) } } }]}><Input type="datetime-local" /></Form.Item>
        <Form.Item name="durationMinutes" label="Длительность, мин" rules={[{ required: true }, { type: 'integer', min: 1 }]}><InputNumber min={1} precision={0} /></Form.Item>
        <Typography.Title level={5}>Участники</Typography.Title>
        <Typography.Text type="secondary">Максимум для выбранной услуги и манежа: {Number.isFinite(participantLimit) ? participantLimit : selectedServiceRecord?.maxCapacity ?? 1}</Typography.Text>
        <Form.List name="participants" initialValue={[{}]} rules={[{
          validator: async (_, value: BookingParticipantValues[] | undefined) => {
            if (!value?.length) throw new Error('Добавьте хотя бы одного участника')
            if (value.length > participantLimit) throw new Error(`Можно добавить не более ${participantLimit} участников`)
          },
        }]}>
          {(fields, { add, remove }, { errors }) => <Space direction="vertical" size="middle" style={{ width: '100%', marginTop: 12 }}>
            {fields.map(field => <ParticipantEditor
              key={field.key}
              index={field.name}
              form={form}
              clients={clients}
              horses={horses}
              participants={participants ?? []}
              service={selectedServiceRecord}
              startTime={selectedStart}
              durationMinutes={duration}
              canRemove={fields.length > 1}
              onRemove={() => remove(field.name)}
              report={report}
            />)}
            <Button onClick={() => add({})} disabled={!selectedServiceRecord || fields.length >= participantLimit}>Добавить участника</Button>
            <Form.ErrorList errors={errors} />
          </Space>}
        </Form.List>
        <Button type="primary" htmlType="submit" loading={saving} disabled={!ready} style={{ marginTop: 16 }}>Создать занятие</Button>
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
          { key: 'arena', label: 'Манеж', children: detail.arena?.name || 'Не указан' },
          { key: 'clients', label: 'Участники', children: detail.bookings.length ? <Space direction="vertical" size={4}>{detail.bookings.map(booking => <Space key={booking.id} wrap>
            <span>{personName(booking.client)}</span>
            <Tag>{booking.horse?.name || 'Без лошади'}</Tag>
            {booking.membership && <Tag color="green">Абонемент: {booking.membership.remainedLessons} / {booking.membership.totalLessons}</Tag>}
          </Space>)}</Space> : 'Нет участников' },
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
