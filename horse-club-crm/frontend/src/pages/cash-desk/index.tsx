import { PeriodClosingButton } from '../cash-desk/PeriodClosingModal'
import { MonthlyClosingPanel } from './MonthlyClosingPanel'
import { usePermissions as useModules } from '../../modulePermissions'
import { useEffect, useState } from 'react'
import { usePermissions } from '@refinedev/core'
import { useSearchParams } from 'react-router-dom'
import { Alert, App, Button, Card, DatePicker, Form, InputNumber, Modal, Result, Segmented, Space, Spin, Tag, Typography } from 'antd'
import dayjs from 'dayjs'
import 'dayjs/locale/ru'
import ruDatePicker from 'antd/es/date-picker/locale/ru_RU'
import { API_URL, httpClient, toHttpError } from '../../httpClient'
import { CashMetrics } from './CashMetrics'
import { CashJournal } from './CashJournal'
import { CashDeskButton } from './CashDeskPaymentModal'
import { cashTime, currency, periodRange, type CashShift, type CashSummary } from './shared'
import { ExpenseHistory, ExpenseModal } from './expenses'
import { CashManagement } from './CashManagement'

export function CashDeskPage() {
  const { data: role, isLoading } = usePermissions({})
  useEffect(() => { document.title = 'Касса — Horse Club OS' }, [])
  if (isLoading) return <Spin />
  if (role !== 'ADMIN' && role !== 'MANAGER') return <Result status="403" title="Касса доступна администратору и менеджеру" />
  return <CashDeskBook />
}
function CashDeskBook() {
  const { canWrite } = useModules()
  const writable = canWrite('CASHBOX')
  const { data: role } = usePermissions({})
  const [expenseOpen, setExpenseOpen] = useState(false)
  const [params, setParams] = useSearchParams()
  const period = params.get('period') || 'today'
  const dateBasis = params.get('dateBasis') === 'payment' ? 'payment' : 'service'
  const from = params.get('from') || '', to = params.get('to') || ''
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
        const noPeriod = (period === 'shift' && !active) || (period === 'custom' && (!from || !to))
        const range = periodRange(period, from, to)
        const { data } = await httpClient.get<CashSummary>(`${API_URL}/finance/summary`, { params: { ...range, dateBasis, ...(period === 'shift' && active ? { from: active.openedAt, shiftId: active.id } : {}), page: 1, pageSize: 1 }, signal: controller.signal })
        if (!controller.signal.aborted) {
          setSummary(noPeriod ? { ...data, totalCash: '0', totalCard: '0', totalRevenue: '0', totalUnspecified: '0',
            totalExpenses: '0', totalExpensesCash: '0', totalExpensesCard: '0', netTotal: '0', operationsCount: 0, operations: [] } : data)
        }
      } catch (cause) { if (!controller.signal.aborted) setError(toHttpError(cause).message) }
      finally { if (!controller.signal.aborted) setLoading(false) }
    })()
    return () => controller.abort()
  // URL primitives own loading and filter state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, from, to, dateBasis, refresh])
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
  return <Space className="cash-desk-page gap-6" direction="vertical" size="large" style={{ width: '100%' }}>
    {!writable && <Alert type="info" showIcon message="Доступно только для просмотра" />}
    <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}><div><Typography.Title level={2}>Касса</Typography.Title><Typography.Text type="secondary">Кассовая книга · время Москвы</Typography.Text></div><Space wrap><PeriodClosingButton /><CashDeskButton /><Button type="primary" disabled={!writable} onClick={() => setExpenseOpen(true)}>Внести расход</Button><Button onClick={() => setRefresh(value => value + 1)} loading={loading}>Обновить</Button>{writable && role === 'ADMIN' && <CashManagement onReset={() => { setShift(null); setSummary(undefined); changeParams({ period: 'today', page: '1', expensePage: '1' }) }} />}</Space></Space>
    <Card><Space wrap>
      <Tag>{shift ? `Смена открыта ${cashTime(shift.openedAt)}` : 'Нет открытой смены'}</Tag>
      {shift ? <><Typography.Text>Размен на начало: {currency(shift.startingCash)}</Typography.Text><Button disabled={!writable} onClick={closeShift}>Закрыть смену</Button></> : <Button disabled={!writable} onClick={() => { setShiftError(undefined); setOpening(true) }}>Открыть смену</Button>}
    </Space></Card>
    <section className="cash-summary-section gap-6" aria-labelledby="cash-current-title">
      <Space wrap><Typography.Title level={3} id="cash-current-title">Текущий баланс</Typography.Title><Tag>Текущий остаток</Tag></Space>
      <CashMetrics loading={loading} unavailable={Boolean(error) || !summary} items={[
        ['Остаток в кассе (наличные)', summary?.balanceCash],
        ['Остаток на счёте (безнал)', summary?.balanceCard],
        ['Итого по клубу', summary?.balanceTotal],
      ]} />
      {!error && Number(summary?.balanceUnspecified) > 0 && <Tag color="warning" className="cash-unknown-balance">В итого включены оплаты без способа: <span className="whitespace-nowrap">{currency(summary?.balanceUnspecified)}</span></Tag>}
      {summary?.cashboxes && !error && <Space wrap className="cashbox-breakdown tabular-nums" aria-label="Разбивка остатков по кассам">
        <span>Основная: <strong>{currency(summary.cashboxes.mainBalance)}</strong></span>
        <span>Постой: <strong>{currency(summary.cashboxes.boardingBalance)}</strong></span>
      </Space>}
    </section>
    <section className="cash-summary-section gap-6" aria-labelledby="cash-turnover-title">
      <Typography.Title level={3} id="cash-turnover-title">Обороты за выбранный период</Typography.Title>
      <Segmented size="small" aria-label="Дата учёта поступлений" value={dateBasis} onChange={value => changeParams({ dateBasis: value, page: '1' })} options={[{ value: 'service', label: 'По дате услуги' }, { value: 'payment', label: 'По дате оплаты' }]} />
    <Space className="cash-desk-filters" wrap><Segmented value={period} onChange={value => changeParams({ period: String(value), page: '1' })} options={[{ value: 'today', label: 'Сегодня' }, { value: 'shift', label: 'Текущая смена' }, { value: 'yesterday', label: 'Вчера' }, { value: 'week', label: 'Текущая неделя' }, { value: 'month', label: 'Текущий месяц' }, { value: 'custom', label: 'Выбрать даты' }]} />
      {period === 'custom' && <DatePicker.RangePicker locale={ruDatePicker} aria-label="Период кассовой книги" format="DD.MM.YYYY" value={from && to ? [dayjs(from), dayjs(to)] : null} onChange={values => changeParams({ from: values?.[0]?.format('YYYY-MM-DD') || '', to: values?.[1]?.format('YYYY-MM-DD') || '', page: '1' })} />}
    </Space>
    {error && <Alert type="error" role="alert" showIcon message="Не удалось загрузить кассу" description={error} action={<Button onClick={() => setRefresh(value => value + 1)}>Повторить</Button>} />}
    {!error && Number(summary?.totalUnspecified) > 0 && <Alert type="warning" showIcon message={`Ранее внесённые оплаты без указанного способа: ${currency(summary?.totalUnspecified)}`} description="Они включены в поступления, но не отнесены к наличным или безналичным." />}
    {period === 'shift' && !loading && !shift && <Alert type="info" message="Откройте смену, чтобы учитывать её платежи отдельно" />}
    {period === 'custom' && (!from || !to) && <Alert type="info" message="Выберите начало и конец периода" />}
    <CashMetrics turnover loading={loading} unavailable={Boolean(error) || !summary} items={[
      ['Наличные за период', summary?.totalCash],
      ['Безналичные за период', summary?.totalCard],
      ['Всего поступлений', summary?.totalRevenue],
      ['Всего расходов', summary?.totalExpenses],
    ]} />
    </section>
    <CashJournal {...periodRange(period, from, to)} {...(period === 'shift' && shift ? { from: shift.openedAt, shiftId: shift.id } : {})}
      inactive={(period === 'shift' && !shift) || (period === 'custom' && (!from || !to))} refresh={refresh} />
    {!(period === 'shift' && !shift) && !(period === 'custom' && (!from || !to)) && <ExpenseHistory key={`${period}:${from}:${to}`} {...periodRange(period, from, to)} {...(period === 'shift' && shift ? { from: shift.openedAt, shiftId: shift.id } : {})} refresh={refresh} admin={writable && role === 'ADMIN'} />}
    <MonthlyClosingPanel canClose={writable && (role === 'ADMIN' || role === 'MANAGER')} refresh={refresh} />
    {expenseOpen && <ExpenseModal variant="drawer" onClose={() => setExpenseOpen(false)} />}
    <Modal open={opening} title="Открыть смену" onCancel={() => { if (!shiftBusy) setOpening(false) }} maskClosable={false} okText="Открыть смену" cancelText="Отмена" confirmLoading={shiftBusy} onOk={() => form.submit()}>
      {shiftError && <Alert type="error" message={shiftError} />}
      <Form form={form} noValidate layout="vertical" initialValues={{ startingCash: 0 }} onFinish={openShift} disabled={shiftBusy}><Form.Item name="startingCash" label="Наличные на начало смены, ₽" rules={[{ required: true, type: 'number', min: 0, message: 'Введите сумму от нуля' }]}><InputNumber min={0} max={9999999999.99} precision={2} style={{ width: '100%' }} /></Form.Item></Form>
    </Modal>
  </Space>
}
