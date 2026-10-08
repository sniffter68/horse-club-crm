import { useEffect, useRef, useState } from 'react'
import { useInvalidate, useOnError } from '@refinedev/core'
import { useSelect } from '@refinedev/antd'
import { Alert, App, Button, DatePicker, Empty, Form, InputNumber, Modal, Select, Skeleton, Space, Typography } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { API_URL, httpClient, toHttpError } from '../../httpClient'
import { useCatalogPermissions } from '../catalogs/permissions'
import type { Client } from '../catalogs/types'
import { personName } from '../cards/format'
import { CLUB_TIME_ZONE, toInstant, toLocalInput } from '../schedule/time'

type PlacementContext = { kind: 'HORSE' | 'STALL'; id: string; name: string; isUnavailable?: boolean }
type ContractSummary = { id: string; status: string; startsAt: string; endsAt: string | null; stall?: { name: string } | null; horse?: { name: string } }
type Choice = { id: string; name: string }
type Availability = { horses: Choice[]; stalls: Choice[] }
type PlacementValues = { horseId: string; stallId: string; clientId: string; startsAt: Dayjs; monthlyRate: number }

export function isCurrentBoarding(contract: ContractSummary, now = Date.now()): boolean {
  return ['ACTIVE', 'SUSPENDED'].includes(contract.status) && new Date(contract.startsAt).getTime() <= now
    && (!contract.endsAt || new Date(contract.endsAt).getTime() > now)
}

function useBoardingRefresh() {
  const invalidate = useInvalidate()
  return () => Promise.all(['horses', 'stalls', 'boarding-contracts', 'clients', 'payments'].map(resource =>
    invalidate({ resource, invalidates: ['all'] })))
}

export function QuickBoardingActions({ context, contracts, currentContract }: {
  context: PlacementContext; contracts: ContractSummary[]; currentContract?: ContractSummary | null
}) {
  const { canManage } = useCatalogPermissions()
  const refresh = useBoardingRefresh()
  const { mutate: onError } = useOnError()
  const { message } = App.useApp()
  const [place, setPlace] = useState(false)
  const [release, setRelease] = useState<ContractSummary>()
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const [error, setError] = useState<string>()
  const current = currentContract === undefined ? contracts.find(contract => isCurrentBoarding(contract)) : currentContract
  const terminate = async () => {
    if (!release || lock.current) return
    lock.current = true
    setBusy(true)
    setError(undefined)
    try {
      await httpClient.post(`${API_URL}/boarding-contracts/${release.id}/terminate`)
      setRelease(undefined)
      void message.success('Денник освобождён. Договор постоя завершён')
      await refresh()
    } catch (cause) {
      const failure = toHttpError(cause)
      setError(failure.message)
      if (failure.statusCode === 401) onError(failure)
    } finally { lock.current = false; setBusy(false) }
  }
  if (!canManage) return null
  return <div className="quick-boarding-actions">
    {current ? <Button size="small" onClick={() => { setError(undefined); setRelease(current) }}>Освободить денник</Button>
      : context.kind === 'STALL' && context.isUnavailable ? <Typography.Text type="secondary">Заселение недоступно: денник закрыт.</Typography.Text>
        : <Button className="quick-boarding-primary" type="primary" size="small" onClick={() => setPlace(true)}>
          {context.kind === 'HORSE' ? '+ Разместить в денник' : '+ Заселить лошадь'}
        </Button>}
    {place && <QuickPlacement context={context} onClose={() => setPlace(false)} />}
    <Modal title="Освободить денник?" open={Boolean(release)} onCancel={() => { if (!busy) setRelease(undefined) }}
      onOk={() => void terminate()} okText="Освободить" cancelText="Оставить" confirmLoading={busy}
      closable={!busy} keyboard={!busy} maskClosable={!busy} cancelButtonProps={{ disabled: busy }}>
      <Typography.Paragraph>Завершить текущий постой · {context.name}? Договор и начисления сохранятся в истории.</Typography.Paragraph>
      {error && <Alert type="error" showIcon message="Не удалось освободить денник" description={error} />}
    </Modal>
  </div>
}

function QuickPlacement({ context, onClose }: { context: PlacementContext; onClose: () => void }) {
  const [form] = Form.useForm<PlacementValues>()
  const [initialStart] = useState(() => dayjs(toLocalInput(new Date())))
  const [selectedStart, setSelectedStart] = useState<Dayjs | null>(initialStart)
  const [revision, setRevision] = useState(0)
  const [availability, setAvailability] = useState<{ key: string; data?: Availability; error?: string }>({ key: '' })
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const [error, setError] = useState<string>()
  const { message } = App.useApp()
  const { mutate: onError } = useOnError()
  const refresh = useBoardingRefresh()
  const { selectProps: clients, query: clientsQuery } = useSelect<Client>({ resource: 'clients', optionLabel: personName, optionValue: 'id',
    pagination: { mode: 'server', pageSize: 100 }, debounce: 300,
    onSearch: value => [{ field: 'q', operator: 'contains', value: value.trim() }],
    queryOptions: { retry: false }, errorNotification: false,
  })
  let instant = ''
  try { if (selectedStart?.isValid()) instant = toInstant(selectedStart.format('YYYY-MM-DDTHH:mm')) } catch { /* Form validation explains invalid local times. */ }
  const key = `${instant}:${revision}`
  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      if (!instant) return
      try {
        const { data } = await httpClient.get<Availability>(`${API_URL}/boarding-contracts/availability`, { params: { startsAt: instant }, signal: controller.signal })
        if (!controller.signal.aborted) setAvailability({ key, data })
      } catch (cause) {
        if (controller.signal.aborted) return
        const failure = toHttpError(cause)
        setAvailability({ key, error: failure.message })
        if (failure.statusCode === 401) onError(failure)
      }
    }
    void load()
    return () => controller.abort()
  }, [instant, key, onError])
  const data = availability.key === key ? availability.data : undefined
  const loadError = availability.key === key ? availability.error : undefined
  const horseId = Form.useWatch<string>('horseId', form) ?? (context.kind === 'HORSE' ? context.id : undefined)
  const stallId = Form.useWatch<string>('stallId', form) ?? (context.kind === 'STALL' ? context.id : undefined)
  const eligible = Boolean(data && (!horseId || data.horses.some(item => item.id === horseId)) && (!stallId || data.stalls.some(item => item.id === stallId)))
  const blocked = !instant || !data || !data.horses.length || !data.stalls.length || !eligible || busy || clientsQuery.isFetching || Boolean(clientsQuery.error)
  const reload = () => { setRevision(value => value + 1); void clientsQuery.refetch() }
  const submit = async (values: PlacementValues) => {
    if (blocked || lock.current) return
    lock.current = true
    setBusy(true)
    setError(undefined)
    try {
      await httpClient.post(`${API_URL}/boarding-contracts`, {
        horseId: context.kind === 'HORSE' ? context.id : values.horseId,
        stallId: context.kind === 'STALL' ? context.id : values.stallId,
        clientId: values.clientId, startsAt: toInstant(values.startsAt.format('YYYY-MM-DDTHH:mm')),
        status: 'ACTIVE', monthlyRate: values.monthlyRate,
      })
      void message.success('Лошадь заселена в денник')
      onClose()
      await refresh()
    } catch (cause) {
      const failure = toHttpError(cause)
      setError(failure.message)
      if (failure.statusCode === 401) onError(failure)
      if (failure.statusCode === 409) setRevision(value => value + 1)
    } finally { lock.current = false; setBusy(false) }
  }
  const choices = (items: Choice[] = []) => items.map(item => ({ value: item.id, label: item.name }))
  return <Modal open title={`Быстрое заселение · ${context.name}`} onCancel={onClose} width={520}
    onOk={() => form.submit()} okText={context.kind === 'HORSE' ? 'Заселить' : 'Подтвердить'} cancelText="Отмена"
    okButtonProps={{ disabled: blocked, className: 'quick-boarding-primary' }} confirmLoading={busy}
    cancelButtonProps={{ disabled: busy }} closable={!busy} maskClosable={!busy} keyboard={!busy}>
    <div className="quick-boarding-form">
      <Typography.Paragraph type="secondary">Постой без даты окончания. Часовой пояс: {CLUB_TIME_ZONE}.</Typography.Paragraph>
      <Form<PlacementValues> form={form} layout="vertical" noValidate disabled={busy} onFinish={submit}
        initialValues={{ startsAt: initialStart, monthlyRate: 0, ...(context.kind === 'HORSE' ? { horseId: context.id } : { stallId: context.id }) }}>
        <Form.Item name="startsAt" label="Дата начала" rules={[{ required: true, message: 'Укажите дату начала' }, { validator: async (_rule, value: Dayjs | undefined) => {
          if (value) toInstant(value.format('YYYY-MM-DDTHH:mm'))
        } }]}>
          <DatePicker aria-label="Дата начала" showTime={{ format: 'HH:mm' }} format="DD.MM.YYYY HH:mm" showNow={false}
            onChange={value => setSelectedStart(value)} style={{ width: '100%' }} />
        </Form.Item>
        {!data && !loadError && instant && <Skeleton active paragraph={{ rows: 1 }} title={false} />}
        {(loadError || clientsQuery.error) && <Space direction="vertical" className="quick-boarding-feedback">
          <Alert type="error" showIcon message="Не удалось загрузить варианты заселения" description={loadError || clientsQuery.error?.message} />
          <Button onClick={reload}>Повторить загрузку</Button>
        </Space>}
        {data && !eligible && <Alert type="warning" showIcon message="Выбранная лошадь или денник уже заняты на этот период. Выберите другой вариант или дату." />}
        {data && (!data.horses.length || !data.stalls.length) && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={!data.stalls.length ? 'Свободных денников на этот период нет' : 'Нет лошадей без постоя на этот период'} />}
        <Form.Item name="horseId" label="Лошадь" rules={[{ required: true, message: 'Выберите лошадь' }]}>
          <Select aria-label="Лошадь" showSearch optionFilterProp="label" disabled={busy || context.kind === 'HORSE' || !data}
            options={context.kind === 'HORSE' ? [{ value: context.id, label: context.name }] : choices(data?.horses)} placeholder="Выберите лошадь"
            notFoundContent="Нет свободных лошадей" />
        </Form.Item>
        <Form.Item name="stallId" label="Денник" rules={[{ required: true, message: 'Выберите денник' }]}>
          <Select aria-label="Денник" showSearch optionFilterProp="label" disabled={busy || context.kind === 'STALL' || !data}
            options={context.kind === 'STALL' ? [{ value: context.id, label: context.name }] : choices(data?.stalls)} placeholder="Выберите денник"
            notFoundContent="Нет свободных денников" />
        </Form.Item>
        <Form.Item name="clientId" label="Владелец / клиент" rules={[{ required: true, message: 'Выберите владельца или клиента' }]}>
          <Select {...clients} aria-label="Владелец / клиент" showSearch filterOption={false} placeholder="Найдите клиента по имени или телефону"
            notFoundContent={clientsQuery.isFetching ? 'Поиск…' : 'Клиенты не найдены'} />
        </Form.Item>
        <Form.Item name="monthlyRate" label="Стоимость в месяц, ₽" extra="0 ₽ — постой без начисления оплаты."
          rules={[{ required: true, message: 'Укажите стоимость' }, { type: 'number', min: 0, max: 9999999999.99, message: 'Укажите неотрицательную стоимость' }]}>
          <InputNumber aria-label="Стоимость в месяц, ₽" min={0} max={9999999999.99} precision={2} style={{ width: '100%' }} />
        </Form.Item>
      </Form>
      {error && <Alert type="error" showIcon message="Не удалось заселить лошадь" description={error} />}
    </div>
  </Modal>
}
