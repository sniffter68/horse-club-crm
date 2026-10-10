import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useInvalidate, usePermissions } from '@refinedev/core'
import { Alert, App, Button, Form, Input, InputNumber, Modal, Segmented, Select, Space, Statistic } from 'antd'
import { PlusOutlined, UserAddOutlined } from '@ant-design/icons'
import { API_URL, httpClient, toHttpError } from '../../httpClient'
import { currency, cashTime } from './shared'
import { QuickCreateClientModal, type CreatedClient } from '../clients/QuickCreateClientModal'

const clientOption = (row: CreatedClient) => ({ value: row.id, label: `${row.name || [row.lastName, row.firstName].filter(Boolean).join(' ')} · ${row.phone || 'без телефона'}` })

type Choice = { value: string; label: string; price: number; bookingId?: string; membershipId?: string; serviceId?: string; serviceType?: string }
type Values = { clientId: string; choice: string; amount: number; cashGiven?: number; method: string; nonCash: string; notes?: string }
const CashDeskContext = createContext<() => void>(() => {})
export function CashDeskButton() {
  const open = useContext(CashDeskContext)
  const { data: role } = usePermissions({})
  return role === 'ADMIN' || role === 'MANAGER' ? <Button type="primary" aria-label="Принять платёж" icon={<PlusOutlined />} onClick={open}>Принять платёж</Button> : null
}
export function CashDeskProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [revision, setRevision] = useState(0)
  return <CashDeskContext.Provider value={() => { setRevision(value => value + 1); setOpen(true) }}>
    {children}
    {open && <CashDeskPaymentModal key={revision} onClose={() => setOpen(false)} />}
  </CashDeskContext.Provider>
}
export function CashDeskPaymentModal({ onClose }: { onClose: () => void }) {
  const [form] = Form.useForm<Values>()
  const { message, modal } = App.useApp()
  const invalidate = useInvalidate()
  const [clients, setClients] = useState<Array<{ value: string; label: string }>>([])
  const [choices, setChoices] = useState<Choice[]>([])
  const [search, setSearch] = useState('')
  const [quickCreate, setQuickCreate] = useState(false)
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false)
  const createdClients = useRef<CreatedClient[]>([])
  const restoreFocus = useRef(false)
  const [loading, setLoading] = useState(false)
  const [optionsLoading, setOptionsLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [locked, setLocked] = useState(false)
  const pending = useRef(false)
  const requestId = useRef(crypto.randomUUID())
  const submitted = useRef<Values | null>(null)
  const clientId = Form.useWatch('clientId', form)
  const method = Form.useWatch('method', form)
  const amount = Form.useWatch('amount', form) ?? 0
  const cashGiven = Form.useWatch('cashGiven', form) ?? 0
  const choice = Form.useWatch('choice', form)
  const change = (Math.round(cashGiven * 100) - Math.round(amount * 100)) / 100
  useEffect(() => {
    if (quickCreate) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setLoading(true)
      httpClient.get(`${API_URL}/clients`, { params: { q: search, _start: 0, _end: 30 }, signal: controller.signal })
        .then(({ data }: { data: CreatedClient[] }) => {
          if (controller.signal.aborted) return
          const rows = new Map(data.map(row => [row.id, row]))
          for (const row of createdClients.current) {
            if (!search || `${row.name} ${row.phone ?? ''}`.toLocaleLowerCase('ru').includes(search.toLocaleLowerCase('ru'))) rows.set(row.id, row)
          }
          setClients([...rows.values()].map(clientOption))
        })
        .catch(cause => { if (!controller.signal.aborted) setError(toHttpError(cause).message) })
        .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    }, search ? 300 : 0)
    return () => { clearTimeout(timer); controller.abort() }
  }, [search, quickCreate])
  useEffect(() => {
    if (!clientId) return
    const controller = new AbortController()
    Promise.all([
      httpClient.get(`${API_URL}/services`, { params: { _start: 0, _end: 100 }, signal: controller.signal }),
      httpClient.get(`${API_URL}/payments/cash-desk/options/${clientId}`, { signal: controller.signal }),
    ]).then(([services, linked]) => {
      if (controller.signal.aborted) return
      const options: Choice[] = services.data.map((row: { id: string; title: string; name: string; price: string }) => ({ value: `service:${row.id}`, label: row.title || row.name, price: Number(row.price), serviceId: row.id }))
      for (const row of linked.data.bookings) options.unshift({ value: `booking:${row.id}`, label: `Занятие · ${cashTime(row.startTime)} · ${row.lesson?.service?.title || row.lesson?.service?.name || row.serviceType || 'Тренировка'}`, price: Number(row.costAmount) || Number(row.lesson?.service?.price || 0), bookingId: row.id })
      for (const row of linked.data.memberships) if ((row.type !== 'fixed_lessons' || !row.payments.some((p: { status: string }) => p.status === 'PAID')) && row.status !== 'frozen') options.push({ value: `membership:${row.id}`, label: `Абонемент · ${row.title || row.pricingPlan?.name || row.type}`, price: Number(row.payments.find((p: { status: string }) => p.status === 'PENDING')?.amount || row.pricingPlan?.price || 0), membershipId: row.id })
      options.push({ value: 'manual', label: 'Другая услуга — указать сумму', price: 0, serviceType: 'Другая услуга' })
      setChoices(options)
    }).catch(cause => { if (!controller.signal.aborted) setError(toHttpError(cause).message) })
      .finally(() => { if (!controller.signal.aborted) setOptionsLoading(false) })
    return () => controller.abort()
  }, [clientId, form])
  const close = () => {
    if (pending.current) return
    if (form.isFieldsTouched()) modal.confirm({ title: 'Закрыть кассу?', content: 'Введённые данные платежа будут потеряны.', okText: 'Закрыть', cancelText: 'Продолжить', onOk: onClose })
    else onClose()
  }
  const returnToPayment = () => { restoreFocus.current = true; setQuickCreate(false) }
  const clientCreated = (client: CreatedClient) => {
    createdClients.current.push(client)
    setClients(rows => [...rows.filter(row => row.value !== client.id), clientOption(client)])
    // A booking or membership belongs to its original client; generic services can be retained.
    const selected = choices.find(row => row.value === form.getFieldValue('choice'))
    if (selected?.bookingId || selected?.membershipId) {
      form.setFieldValue('choice', undefined)
      void message.info('Выберите услугу для нового клиента')
    }
    form.setFieldValue('clientId', client.id)
    setOptionsLoading(true)
    setSearch('')
    void invalidate({ resource: 'clients', invalidates: ['list', 'many'] })
    returnToPayment()
  }
  const pay = async (values: Values) => {
    if (pending.current) return
    const selected = choices.find(row => row.value === values.choice)
    if (!selected) return
    if (values.method === 'CASH' && change < 0) return
    // Keep the operation key and payload after an uncertain network outcome.
    const payload = submitted.current ?? values
    const source = choices.find(row => row.value === payload.choice) ?? selected
    submitted.current = payload
    setLocked(true)
    pending.current = true; setBusy(true); setError(undefined)
    try {
      const { data } = await httpClient.post(`${API_URL}/payments/cash-desk`, {
        requestId: requestId.current, clientId: payload.clientId, amount: payload.amount,
        method: payload.method === 'CASH' ? 'CASH' : payload.nonCash,
        ...(payload.method === 'CASH' ? { cashGiven: payload.cashGiven } : {}), notes: payload.notes,
        bookingId: source.bookingId, membershipId: source.membershipId, serviceId: source.serviceId, serviceType: source.serviceType,
      })
      void message.success(data.method === 'CASH' ? `Платёж проведён. Сдача: ${currency(data.cashChange)}` : 'Платёж проведён')
      void invalidate({ invalidates: ['all'] })
      window.dispatchEvent(new Event('cash-desk-paid'))
      onClose()
    } catch (cause) {
      const failure = toHttpError(cause)
      setError(failure.message + (failure.statusCode === 0 || failure.statusCode >= 500 ? ' Повторите проведение: данные операции сохранены, повторный платёж не создастся.' : ''))
      if (failure.statusCode > 0 && failure.statusCode < 500) { submitted.current = null; setLocked(false) }
    } finally { pending.current = false; setBusy(false) }
  }
  return <><Modal className="cash-desk-modal" forceRender open={!quickCreate} title="Принять оплату / Касса" onCancel={close} maskClosable={false} width={600}
    focusTriggerAfterClose={!quickCreate} afterOpenChange={visible => {
      if (visible && restoreFocus.current) { restoreFocus.current = false; form.scrollToField('amount', { focus: true }) }
    }}
    footer={<Space><Button disabled={busy} onClick={close}>Отмена</Button><Button type="primary" loading={busy} disabled={optionsLoading || !choice || amount <= 0 || (method === 'CASH' && change < 0)} onClick={() => form.submit()}>Провести платёж</Button></Space>}>
    {error && <Alert role="alert" type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
    <Form form={form} layout="vertical" noValidate initialValues={{ method: 'CASH', nonCash: 'CARD_TERMINAL' }} onFinish={pay} disabled={busy || locked} scrollToFirstError>
      <Form.Item name="clientId" label="Клиент" rules={[{ required: true, message: 'Выберите клиента' }]}>
        <Select aria-label="Клиент" showSearch allowClear onChange={value => { form.setFieldsValue({ choice: undefined, amount: undefined }); setChoices([]); setOptionsLoading(Boolean(value)); setSearch('') }}
          open={clientDropdownOpen} onOpenChange={setClientDropdownOpen}
          filterOption={false} searchValue={search} onSearch={value => { setLoading(true); setSearch(value) }} onClear={() => setSearch('')}
          loading={loading} options={clients} placeholder="Имя или телефон" notFoundContent={loading ? 'Загрузка…' : 'Ничего не найдено'}
          popupRender={menu => <>{menu}<div style={{ borderTop: '1px solid var(--ant-color-border-secondary, #E4DAD0)', padding: 8 }}>
            <Button block type="link" icon={<UserAddOutlined aria-hidden />} disabled={busy || locked}
              style={{ height: 'auto', whiteSpace: 'normal', textAlign: 'left' }}
              onClick={() => { setClientDropdownOpen(false); setQuickCreate(true) }}>
              {!loading && clients.length === 0 && search.trim() ? `Создать клиента «${search.trim()}»` : '+ Новый клиент'}
            </Button>
          </div></>} />
      </Form.Item>
      <Form.Item name="choice" label="Услуга / занятие / абонемент" rules={[{ required: true, message: 'Выберите услугу' }]}>
        <Select aria-label="Услуга / занятие / абонемент" showSearch optionFilterProp="label" loading={optionsLoading} disabled={!clientId || optionsLoading || busy || locked} options={choices} placeholder="Выберите основание платежа" onChange={value => form.setFieldValue('amount', choices.find(row => row.value === value)?.price)} />
      </Form.Item>
      <Form.Item name="amount" label="Сумма чека, ₽" rules={[{ required: true, type: 'number', min: 0.01, message: 'Введите сумму больше нуля' }]}><InputNumber aria-label="Сумма чека, ₽" min={0.01} max={9999999999.99} precision={2} style={{ width: '100%' }} /></Form.Item>
      <Form.Item name="method" label="Способ оплаты"><Segmented options={[{ label: 'Наличные', value: 'CASH' }, { label: 'Безнал', value: 'NON_CASH' }]} block /></Form.Item>
      {method === 'CASH' ? <>
        <Form.Item name="cashGiven" label="Внесено клиентом, ₽" rules={[{ required: true, type: 'number', min: amount, message: 'Внесено меньше суммы чека' }]}><InputNumber aria-label="Внесено клиентом, ₽" min={0} max={9999999999.99} precision={2} style={{ width: '100%' }} /></Form.Item>
        <Space wrap style={{ marginBottom: 16 }}>{[1000, 2000, 5000].map(value => <Button key={value} onClick={() => form.setFieldValue('cashGiven', cashGiven + value)}>+{value}</Button>)}<Button onClick={() => form.setFieldValue('cashGiven', amount)}>Без сдачи</Button></Space>
        <div className="cash-desk-change" aria-live="polite"><Statistic title={change < 0 ? 'Не хватает' : 'Сдача'} value={Math.abs(change)} precision={2} suffix="₽" />{change < 0 && <span>Увеличьте внесённую сумму</span>}</div>
      </> : <Form.Item name="nonCash" label="Вид безналичной оплаты"><Select options={[{ label: 'Банковский терминал', value: 'CARD_TERMINAL' }, { label: 'СБП', value: 'SBP' }, { label: 'Перевод', value: 'TRANSFER' }]} /></Form.Item>}
      <Form.Item name="notes" label="Комментарий"><Input.TextArea rows={2} maxLength={500} style={{ resize: 'none' }} /></Form.Item>
    </Form>
  </Modal>
    {quickCreate && <QuickCreateClientModal initialQuery={search} onCreated={clientCreated} onCancel={returnToPayment} />}
  </>
}
