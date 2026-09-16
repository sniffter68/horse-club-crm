import { useCallback, useEffect, useState } from 'react'
import { List as RefineList } from '@refinedev/antd'
import { Alert, Button, DatePicker, Descriptions, Form, Input, List, Modal, Select, Space, Tag, Typography } from 'antd'
import type { Dayjs } from 'dayjs'
import { ResponsiveTable } from '../../components/ResponsiveTable'
import { API_URL, httpClient, toHttpError } from '../../httpClient'
import type { Arena, Client, Horse, Service, Trainer } from '../catalogs/types'
import { dateTime, personName } from '../cards/format'
import { statuses, type Status } from '../schedule/types'

interface JournalPayment {
  id: string
  amount: string | number
  status: 'PENDING' | 'PAID' | 'REFUNDED' | 'CANCELLED'
  paidAt: string | null
}

interface JournalBooking {
  id: string
  attendanceStatus: 'PENDING' | 'ATTENDED' | 'NO_SHOW'
  client: Client
  horse: Horse | null
  membership: { id: string; totalLessons: number; remainedLessons: number; validUntil: string } | null
  payments: JournalPayment[]
}

interface JournalLesson {
  id: string
  startTime: string
  endTime: string
  status: Status
  trainer: Trainer
  service: Service
  arena: Arena | null
  bookings: JournalBooking[]
}

interface FilterValues {
  q?: string
  period?: [Dayjs, Dayjs]
  status?: Status
  trainerId?: string
  serviceId?: string
  clientId?: string
  horseId?: string
  arenaId?: string
}

interface Catalogs {
  clients: Client[]
  horses: Horse[]
  trainers: Trainer[]
  services: Service[]
  arenas: Arena[]
}

async function loadCatalog<T>(resource: string, signal: AbortSignal): Promise<T[]> {
  const records: T[] = []
  for (let start = 0; ; start += 100) {
    const response = await httpClient.get<T[]>(`${API_URL}/${resource}`, { signal, params: { _start: start, _end: start + 100 } })
    records.push(...response.data)
    const total = Number(response.headers['x-total-count'])
    if (response.data.length < 100 || records.length >= total) return records
  }
}

const paymentColors: Record<JournalPayment['status'], string> = {
  PENDING: 'gold', PAID: 'green', REFUNDED: 'blue', CANCELLED: 'default',
}
const paymentLabels: Record<JournalPayment['status'], string> = {
  PENDING: 'Ожидается', PAID: 'Оплачено', REFUNDED: 'Возвращено', CANCELLED: 'Отменено',
}
const attendanceLabels: Record<JournalBooking['attendanceStatus'], string> = {
  PENDING: 'Не отмечен', ATTENDED: 'Был', NO_SHOW: 'Неявка',
}

export function LessonHistoryPage() {
  const [form] = Form.useForm<FilterValues>()
  const [catalogs, setCatalogs] = useState<Catalogs>({ clients: [], horses: [], trainers: [], services: [], arenas: [] })
  const [filters, setFilters] = useState<FilterValues>({})
  const [lessons, setLessons] = useState<JournalLesson[]>([])
  const [selected, setSelected] = useState<JournalLesson>()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      loadCatalog<Client>('clients', controller.signal), loadCatalog<Horse>('horses', controller.signal),
      loadCatalog<Trainer>('trainers', controller.signal), loadCatalog<Service>('services', controller.signal),
      loadCatalog<Arena>('arenas', controller.signal),
    ]).then(([clients, horses, trainers, services, arenas]) => {
      if (!controller.signal.aborted) setCatalogs({ clients, horses, trainers, services, arenas })
    }).catch(cause => { if (!controller.signal.aborted) setError(toHttpError(cause).message) })
    return () => controller.abort()
  }, [])

  const loadLessons = useCallback(async (signal: AbortSignal) => {
    setLoading(true)
    setError(undefined)
    const params: Record<string, string | number> = {
      _start: (page - 1) * pageSize,
      _end: page * pageSize,
      _sort: 'startTime',
      _order: 'DESC',
    }
    if (filters.q?.trim()) params.q = filters.q.trim()
    if (filters.period) {
      params.from = filters.period[0].startOf('day').toISOString()
      params.to = filters.period[1].endOf('day').toISOString()
    }
    for (const key of ['status', 'trainerId', 'serviceId', 'clientId', 'horseId', 'arenaId'] as const) {
      if (filters[key]) params[key] = filters[key]
    }
    try {
      const response = await httpClient.get<JournalLesson[]>(`${API_URL}/lessons/history`, { signal, params })
      if (!signal.aborted) {
        setLessons(response.data)
        setTotal(Number(response.headers['x-total-count']) || 0)
      }
    } catch (cause) {
      if (!signal.aborted) { setLessons([]); setError(toHttpError(cause).message) }
    } finally {
      if (!signal.aborted) setLoading(false)
    }
  }, [filters, page, pageSize])

  useEffect(() => {
    const controller = new AbortController()
    // Synchronize the journal with the current server-side filters and pagination.
    // oxlint-disable-next-line react/set-state-in-effect
    void loadLessons(controller.signal)
    return () => controller.abort()
  }, [loadLessons])

  const applyFilters = (values: FilterValues) => { setPage(1); setFilters(values) }
  const resetFilters = () => { form.resetFields(); setPage(1); setFilters({}) }
  const option = (id: string, label: string) => ({ value: id, label })

  return <>
    <RefineList title="Журнал занятий" canCreate={false}>
      <Form<FilterValues> form={form} layout="vertical" onFinish={applyFilters}>
        <Space align="end" wrap size="middle">
          <Form.Item name="q" label="Поиск"><Input.Search placeholder="Клиент, телефон, услуга, тренер, лошадь" allowClear onSearch={() => form.submit()} style={{ width: 300 }} /></Form.Item>
          <Form.Item name="period" label="Период"><DatePicker.RangePicker format="DD.MM.YYYY" /></Form.Item>
          <Form.Item name="status" label="Статус"><Select allowClear placeholder="Все" style={{ width: 180 }} options={Object.entries(statuses).map(([value, item]) => ({ value, label: item.label }))} /></Form.Item>
          <Form.Item name="clientId" label="Клиент"><Select showSearch allowClear optionFilterProp="label" style={{ width: 220 }} options={catalogs.clients.map(row => option(row.id, personName(row)))} /></Form.Item>
          <Form.Item name="trainerId" label="Тренер"><Select showSearch allowClear optionFilterProp="label" style={{ width: 200 }} options={catalogs.trainers.map(row => option(row.id, row.name))} /></Form.Item>
          <Form.Item name="serviceId" label="Услуга"><Select showSearch allowClear optionFilterProp="label" style={{ width: 220 }} options={catalogs.services.map(row => option(row.id, row.title || row.name || 'Без названия'))} /></Form.Item>
          <Form.Item name="horseId" label="Лошадь"><Select showSearch allowClear optionFilterProp="label" style={{ width: 180 }} options={catalogs.horses.map(row => option(row.id, row.name))} /></Form.Item>
          <Form.Item name="arenaId" label="Манеж"><Select showSearch allowClear optionFilterProp="label" style={{ width: 180 }} options={catalogs.arenas.map(row => option(row.id, row.name))} /></Form.Item>
          <Form.Item><Space><Button type="primary" htmlType="submit">Найти</Button><Button onClick={resetFilters}>Сбросить</Button></Space></Form.Item>
        </Space>
      </Form>
      {error && <Alert type="error" showIcon message="Не удалось загрузить журнал" description={error} style={{ marginBottom: 16 }} />}
      <ResponsiveTable<JournalLesson> rowKey="id" dataSource={lessons} loading={loading} scroll={{ x: 'max-content' }}
        pagination={{ current: page, pageSize, total, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100], showTotal: count => `Всего: ${count}`,
          onChange: (nextPage, nextSize) => { setPage(nextSize !== pageSize ? 1 : nextPage); setPageSize(nextSize) } }}
        columns={[
          { key: 'startTime', title: 'Дата и время', render: (_: unknown, row) => <Button type="link" style={{ padding: 0 }} onClick={() => setSelected(row)}>{dateTime(row.startTime)}</Button> },
          { key: 'service', title: 'Услуга', render: (_: unknown, row) => row.service.title || row.service.name },
          { key: 'clients', title: 'Клиенты', render: (_: unknown, row) => row.bookings.length ? <Space wrap>{row.bookings.map(booking => <Tag key={booking.id}>{personName(booking.client)}</Tag>)}</Space> : 'Без участников' },
          { key: 'trainer', title: 'Тренер', render: (_: unknown, row) => row.trainer.name },
          { key: 'horses', title: 'Лошади', render: (_: unknown, row) => [...new Set(row.bookings.map(booking => booking.horse?.name).filter(Boolean))].join(', ') || '—' },
          { key: 'status', title: 'Статус', render: (_: unknown, row) => <Tag color={statuses[row.status].color}>{statuses[row.status].label}</Tag> },
          { key: 'actions', title: 'Действия', render: (_: unknown, row) => <Button onClick={() => setSelected(row)}>Открыть</Button> },
        ]} />
    </RefineList>

    <Modal title="Карточка занятия" open={Boolean(selected)} footer={null} width={760} destroyOnHidden onCancel={() => setSelected(undefined)}>
      {selected && <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Descriptions bordered size="small" column={2} items={[
          { key: 'time', label: 'Дата и время', children: `${dateTime(selected.startTime)} — ${dateTime(selected.endTime)}` },
          { key: 'status', label: 'Статус', children: <Tag color={statuses[selected.status].color}>{statuses[selected.status].label}</Tag> },
          { key: 'service', label: 'Услуга', children: selected.service.title || selected.service.name },
          { key: 'trainer', label: 'Тренер', children: selected.trainer.name },
          { key: 'arena', label: 'Манеж', span: 2, children: selected.arena?.name || '—' },
        ]} />
        <section><Typography.Title level={5}>Участники</Typography.Title>
          <List dataSource={selected.bookings} locale={{ emptyText: 'Участников нет' }} renderItem={booking => <List.Item>
            <Space direction="vertical" size={3} style={{ width: '100%' }}>
              <Space wrap><Typography.Text strong>{personName(booking.client)}</Typography.Text>{booking.horse && <Tag>{booking.horse.name}</Tag>}
                <Tag color={booking.attendanceStatus === 'ATTENDED' ? 'green' : booking.attendanceStatus === 'NO_SHOW' ? 'orange' : 'default'}>{attendanceLabels[booking.attendanceStatus]}</Tag></Space>
              <Space wrap>{booking.membership ? <Tag color="blue">Абонемент · осталось {booking.membership.remainedLessons}</Tag> : <Tag>Без абонемента</Tag>}
                {booking.payments.map(payment => <Tag key={payment.id} color={paymentColors[payment.status]}>{paymentLabels[payment.status]}: {Number(payment.amount).toLocaleString('ru-RU')} ₽</Tag>)}</Space>
            </Space>
          </List.Item>} />
        </section>
      </Space>}
    </Modal>
  </>
}
