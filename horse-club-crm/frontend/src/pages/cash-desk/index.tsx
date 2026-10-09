import { useEffect, useState } from 'react'
import { usePermissions } from '@refinedev/core'
import { useSearchParams } from 'react-router-dom'
import { Alert, App, Button, Card, Col, DatePicker, Form, InputNumber, Modal, Result, Row, Segmented, Space, Spin, Statistic, Tag, Typography } from 'antd'
import { BankOutlined, CreditCardOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { API_URL, httpClient, toHttpError } from '../../httpClient'
import { ResponsiveTable } from '../../components/ResponsiveTable'
import { CashDeskButton } from './CashDeskPaymentModal'
import { cashTime, currency, operationService, periodRange, type CashOperation, type CashShift, type CashSummary } from './shared'
import { personName } from '../cards/format'

export function CashDeskPage() {
  const { data: role, isLoading } = usePermissions({})
  useEffect(() => { document.title = 'Касса — Horse Club OS' }, [])
  if (isLoading) return <Spin />
  if (role !== 'ADMIN' && role !== 'MANAGER') return <Result status="403" title="Касса доступна администратору и менеджеру" />
  return <CashDeskBook />
}
function CashDeskBook() {
  const [params, setParams] = useSearchParams()
  const period = params.get('period') || 'today'
  const from = params.get('from') || '', to = params.get('to') || ''
  const page = Math.max(1, Number(params.get('page')) || 1)
  const [summary, setSummary] = useState<CashSummary>()
  const [shift, setShift] = useState<CashShift | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [refresh, setRefresh] = useState(0)
  const [opening, setOpening] = useState(false)
  const [shiftBusy, setShiftBusy] = useState(false)
  const [shiftError, setShiftError] = useState<string>()
  const [form] = Form.useForm<{ startingCash: number }>()
  const { modal, message } = App.useApp()
  const changeParams = (values: Record<string, string>) => setParams(current => { const next = new URLSearchParams(current); for (const [key, value] of Object.entries(values)) next.set(key, value); return next })
  useEffect(() => {
    const reload = () => setRefresh(value => value + 1)
    window.addEventListener('cash-desk-paid', reload)
    return () => window.removeEventListener('cash-desk-paid', reload)
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError(undefined)
    ;(async () => {
      try {
        const { data: active } = await httpClient.get<CashShift | null>(`${API_URL}/payments/shifts/current`, { signal: controller.signal })
        if (controller.signal.aborted) return
        setShift(active)
        if (period === 'shift' && !active) { setSummary(undefined); return }
        if (period === 'custom' && (!from || !to)) { setSummary(undefined); return }
        const range = periodRange(period, from, to)
        const { data } = await httpClient.get<CashSummary>(`${API_URL}/payments/summary`, { params: { ...range, ...(period === 'shift' && active ? { from: active.openedAt, shiftId: active.id } : {}), page, pageSize: 20 }, signal: controller.signal })
        if (!controller.signal.aborted) {
          if (page > 1 && data.operationsCount <= (page - 1) * 20) changeParams({ page: String(Math.max(1, Math.ceil(data.operationsCount / 20))) })
          else setSummary(data)
        }
      } catch (cause) { if (!controller.signal.aborted) setError(toHttpError(cause).message) }
      finally { if (!controller.signal.aborted) setLoading(false) }
    })()
    return () => controller.abort()
  // URL primitives own loading and filter state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, from, to, page, refresh])
  const openShift = async ({ startingCash }: { startingCash: number }) => {
    if (shiftBusy) return
    setShiftBusy(true); setShiftError(undefined)
    try {
      await httpClient.post(`${API_URL}/payments/shifts`, { startingCash })
      setOpening(false); setRefresh(value => value + 1); void message.success('Смена открыта')
    } catch (cause) { setShiftError(toHttpError(cause).message) }
    finally { setShiftBusy(false) }
  }
  const closeShift = () => modal.confirm({ title: 'Закрыть кассовую смену?', content: 'Новые платежи больше не попадут в эту смену.', okText: 'Закрыть смену', cancelText: 'Продолжить работу', onOk: async () => {
    try { await httpClient.post(`${API_URL}/payments/shifts/${shift?.id}/close`); setRefresh(value => value + 1); void message.success('Смена закрыта') }
    catch (cause) { setError(toHttpError(cause).message); throw cause }
  } })
  return <Space className="cash-desk-page" direction="vertical" size="large" style={{ width: '100%' }}>
    <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}><div><Typography.Title level={2}>Касса</Typography.Title><Typography.Text type="secondary">Кассовая книга · время Москвы</Typography.Text></div><Space wrap><CashDeskButton /><Button onClick={() => setRefresh(value => value + 1)} loading={loading}>Обновить</Button></Space></Space>
    <Card><Space wrap>
      <Tag>{shift ? `Смена открыта ${cashTime(shift.openedAt)}` : 'Нет открытой смены'}</Tag>
      {shift ? <><Typography.Text>Размен на начало: {currency(shift.startingCash)}</Typography.Text><Button onClick={closeShift}>Закрыть смену</Button></> : <Button onClick={() => { setShiftError(undefined); setOpening(true) }}>Открыть смену</Button>}
    </Space></Card>
    <Space className="cash-desk-filters" wrap><Segmented value={period} onChange={value => changeParams({ period: String(value), page: '1' })} options={[{ value: 'today', label: 'Сегодня' }, { value: 'shift', label: 'Текущая смена' }, { value: 'yesterday', label: 'Вчера' }, { value: 'week', label: 'Текущая неделя' }, { value: 'month', label: 'Текущий месяц' }, { value: 'custom', label: 'Выбрать даты' }]} />
      {period === 'custom' && <DatePicker.RangePicker aria-label="Период кассовой книги" format="DD.MM.YYYY" value={from && to ? [dayjs(from), dayjs(to)] : null} onChange={values => changeParams({ from: values?.[0]?.format('YYYY-MM-DD') || '', to: values?.[1]?.format('YYYY-MM-DD') || '', page: '1' })} />}
    </Space>
    {error && <Alert type="error" role="alert" showIcon message="Не удалось загрузить кассу" description={error} />}
    {!error && Number(summary?.totalUnspecified) > 0 && <Alert type="warning" showIcon message={`Ранее внесённые оплаты без указанного способа: ${currency(summary?.totalUnspecified)}`} description="Они включены в выручку, но не отнесены к наличным или безналичным." />}
    {period === 'shift' && !loading && !shift && <Alert type="info" message="Откройте смену, чтобы учитывать её платежи отдельно" />}
    {period === 'custom' && (!from || !to) && <Alert type="info" message="Выберите начало и конец периода" />}
    <Row gutter={[16, 16]}>{[
      [period === 'shift' ? 'Наличные за смену' : 'Наличные за период', summary?.totalCash],
      [period === 'shift' ? 'Безналичные за смену' : 'Безналичные за период', summary?.totalCard],
      ['Итого выручка', summary?.totalRevenue],
    ].map(([title, value]) => <Col xs={24} md={8} key={title}><Card className="kpi-card"><Statistic title={title} value={error || !summary ? '—' : currency(value)} loading={loading} /></Card></Col>)}</Row>
    <Card title="Кассовая книга" extra={<Typography.Text>{summary && !error ? `Операций: ${summary.operationsCount}` : ''}</Typography.Text>}>
      <ResponsiveTable<CashOperation> rowKey="id" dataSource={error ? [] : summary?.operations ?? []} loading={loading} scroll={{ x: 'max-content' }} locale={{ emptyText: 'За выбранный период платежей нет' }}
        pagination={{ current: page, pageSize: 20, total: error ? 0 : summary?.operationsCount ?? 0, showSizeChanger: false, onChange: value => changeParams({ page: String(value) }), showTotal: total => `Всего: ${total}` }} columns={[
          { key: 'time', title: 'Время', render: (_, row) => cashTime(row.paidAt || row.createdAt) },
          { key: 'client', title: 'Клиент', render: (_, row) => personName(row.client) },
          { key: 'service', title: 'Услуга', render: (_, row) => operationService(row) },
          { key: 'amount', title: 'Сумма', render: (_, row) => currency(row.amount) },
          { key: 'method', title: 'Способ', render: (_, row) => <Tag icon={row.method === 'CASH' ? <BankOutlined /> : <CreditCardOutlined />}>{({ CASH: 'Наличные', CARD: 'Карта', CARD_TERMINAL: 'Терминал', SBP: 'СБП', TRANSFER: 'Перевод', UNSPECIFIED: 'Не указан' })[row.method]}</Tag> },
          { key: 'change', title: 'Сдача', render: (_, row) => row.cashChange == null ? '—' : currency(row.cashChange) },
          { key: 'cashier', title: 'Администратор', render: (_, row) => row.cashier?.email || 'Ранее внесённый платёж' },
        ]} />
    </Card>
    <Modal open={opening} title="Открыть смену" onCancel={() => { if (!shiftBusy) setOpening(false) }} maskClosable={false} okText="Открыть смену" cancelText="Отмена" confirmLoading={shiftBusy} onOk={() => form.submit()}>
      {shiftError && <Alert type="error" message={shiftError} />}
      <Form form={form} noValidate layout="vertical" initialValues={{ startingCash: 0 }} onFinish={openShift} disabled={shiftBusy}><Form.Item name="startingCash" label="Наличные на начало смены, ₽" rules={[{ required: true, type: 'number', min: 0, message: 'Введите сумму от нуля' }]}><InputNumber min={0} max={9999999999.99} precision={2} style={{ width: '100%' }} /></Form.Item></Form>
    </Modal>
  </Space>
}
