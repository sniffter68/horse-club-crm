import { EntryOverlay } from '../../components/EntryOverlay'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Alert, App, Button, Card, DatePicker, Form, Input, InputNumber, Segmented, Select, Space, Tag, Typography } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import ruDatePicker from 'antd/es/date-picker/locale/ru_RU'
import { DateTime } from 'luxon'
import { API_URL, httpClient, toHttpError } from '../../httpClient'
import { ResponsiveTable } from '../../components/ResponsiveTable'
import { cashTime, currency } from './shared'

const expenseCategories = { FEED: 'Сено и корма', BEDDING: 'Опилки', VET_FARRIER: 'Коваль/Ветврач', AMMUNITION: 'Амуниция', MAINTENANCE: 'Хознужды/Ремонт', SALARY: 'Зарплата', OTHER: 'Прочее' }
const categoryOptions = Object.entries(expenseCategories).map(([value, label]) => ({ value, label }))
type Expense = { id: string; isEncashment?: boolean; amount: string; date: string; category: keyof typeof expenseCategories; description: string; paymentMethod: 'CASH' | 'CARD'; createdBy: { email: string } }
type Values = { amount: number; paymentMethod: 'CASH' | 'CARD'; category: keyof typeof expenseCategories; description: string; date: Dayjs }

export function ExpenseModal({ onClose, variant = 'modal' }: { onClose: () => void; variant?: 'modal' | 'drawer' }) {
  const [form] = Form.useForm<Values>()
  const { modal, message } = App.useApp()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const pending = useRef(false)
  const requestId = useRef(crypto.randomUUID())
  const submitted = useRef<Record<string, unknown> | null>(null)
  const [locked, setLocked] = useState(false)
  const close = () => {
    if (pending.current) return
    if (form.isFieldsTouched()) modal.confirm({ title: 'Закрыть внесение расхода?', content: 'Введённые данные будут потеряны.', okText: 'Закрыть', cancelText: 'Продолжить', autoFocusButton: 'cancel', onOk: onClose })
    else onClose()
  }
  const save = async (values: Values) => {
    if (pending.current) return
    const now = DateTime.now().setZone('Europe/Moscow')
    const date = values.date.format('YYYY-MM-DD') === now.toISODate() ? now : DateTime.fromISO(values.date.format('YYYY-MM-DD'), { zone: 'Europe/Moscow' })
    const payload = submitted.current ?? { ...values, description: values.description.trim(), date: date.toISO(), requestId: requestId.current }
    submitted.current = payload
    pending.current = true; setBusy(true); setLocked(true); setError(undefined)
    try {
      await httpClient.post(`${API_URL}/finance/expenses`, payload)
      window.dispatchEvent(new Event('cash-desk-paid'))
      void message.success('Расход внесён'); onClose()
    } catch (cause) {
      const failure = toHttpError(cause)
      setError(failure.message)
      if (failure.statusCode && failure.statusCode < 500) { submitted.current = null; setLocked(false) }
    } finally { pending.current = false; setBusy(false) }
  }
  return <EntryOverlay variant={variant} open title="Внесение расхода" onCancel={close} maskClosable={false} okText="Внести расход" cancelText="Отмена" confirmLoading={busy} onOk={() => form.submit()}>
    {error && <Alert type="error" role="alert" showIcon message={error} description={locked ? 'Повторите отправку: расход с тем же ключом операции будет учтён один раз.' : undefined} />}
    <Form form={form} layout="vertical" noValidate disabled={busy || locked} initialValues={{ paymentMethod: 'CASH', date: dayjs(DateTime.now().setZone('Europe/Moscow').toISODate()) }} onFinish={save} scrollToFirstError>
      <Form.Item name="amount" label="Сумма (руб.)" rules={[{ required: true, type: 'number', min: 0.01, max: 9999999999.99, message: 'Введите положительную сумму' }]}><InputNumber aria-label="Сумма (руб.)" autoFocus min={0.01} max={9999999999.99} precision={2} style={{ width: '100%' }} /></Form.Item>
      <Form.Item name="paymentMethod" label="Способ оплаты"><Segmented options={[{ value: 'CASH', label: 'Наличные' }, { value: 'CARD', label: 'Безналичные' }]} /></Form.Item>
      <Form.Item name="category" label="Статья / Категория" rules={[{ required: true, message: 'Выберите статью расхода' }]}><Select aria-label="Статья / Категория" options={categoryOptions} /></Form.Item>
      <Form.Item name="description" label="На что потрачено" rules={[{ required: true, whitespace: true, message: 'Опишите, на что потрачены деньги' }]}><Input.TextArea aria-label="На что потрачено" maxLength={500} autoSize={{ minRows: 3, maxRows: 6 }} style={{ resize: 'none' }} /></Form.Item>
      <Form.Item name="date" label="Дата расхода" rules={[
        { required: true, message: 'Выберите дату расхода' },
        { validator: (_, date: Dayjs | null) => date && (!date.isValid() || date.format('YYYY-MM-DD') > DateTime.now().setZone('Europe/Moscow').toISODate()!)
          ? Promise.reject(new Error('Дата расхода не может быть в будущем')) : Promise.resolve() },
      ]}><DatePicker aria-label="Дата расхода" locale={ruDatePicker} format="DD.MM.YYYY" disabledDate={date => date.format('YYYY-MM-DD') > DateTime.now().setZone('Europe/Moscow').toISODate()!} /></Form.Item>
    </Form>
  </EntryOverlay>
}

export function ExpenseHistory({ from, to, shiftId, refresh, admin }: { from?: string | null; to?: string | null; shiftId?: string; refresh: number; admin: boolean }) {
  const [params, setParams] = useSearchParams()
  const page = Math.max(1, Number(params.get('expensePage')) || 1)
  const paymentMethod = params.get('expenseMethod') || undefined, category = params.get('expenseCategory') || undefined
  const [result, setResult] = useState<{ data: Expense[]; total: number }>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [revision, setRevision] = useState(0)
  const { modal, message } = App.useApp()
  const update = (key: string, value?: string) => {
    // Sequential filter changes can precede React's next render. Read the latest
    // committed URL so the second filter does not restore the first one's old value.
    const next = new URLSearchParams(window.location.search)
    if (value) next.set(key, value); else next.delete(key)
    if (key !== 'expensePage') next.set('expensePage', '1')
    setParams(next)
  }
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError(undefined)
    httpClient.get(`${API_URL}/finance/expenses`, { params: { from, to, shiftId, paymentMethod, category, page, pageSize: 20 }, signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) {
        if (page > 1 && data.total <= (page - 1) * 20) update('expensePage', String(Math.max(1, Math.ceil(data.total / 20))))
        else setResult(data)
      } })
      .catch(cause => { if (!controller.signal.aborted) setError(toHttpError(cause).message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  // URL primitives own filter state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, shiftId, paymentMethod, category, page, refresh, revision])
  const cancel = (row: Expense) => modal.confirm({ title: 'Отменить расход?', content: `${row.description} · ${currency(row.amount)}. Сумма вернётся в баланс, запись сохранится в учёте как отменённая.`, okText: 'Отменить расход', okButtonProps: { danger: true }, cancelText: 'Сохранить запись', autoFocusButton: 'cancel', onOk: async () => {
    try { await httpClient.delete(`${API_URL}/finance/expenses/${row.id}`); setRevision(value => value + 1); window.dispatchEvent(new Event('cash-desk-paid')); void message.success('Расход отменён') }
    catch (cause) { setError(toHttpError(cause).message); throw cause }
  } })
  return <Card title="История расходов">
    <Space wrap style={{ marginBottom: 16 }}>
      <Select aria-label="Способ оплаты расходов" placeholder="Все способы оплаты" allowClear value={paymentMethod} style={{ width: 220 }} onChange={value => update('expenseMethod', value)} options={[{ value: 'CASH', label: 'Наличные' }, { value: 'CARD', label: 'Безнал' }]} />
      <Select aria-label="Категория расходов" placeholder="Все статьи расходов" allowClear value={category} style={{ width: 220 }} onChange={value => update('expenseCategory', value)} options={categoryOptions} />
      {error && <Button onClick={() => setRevision(value => value + 1)}>Повторить загрузку</Button>}
    </Space>
    {error && <Alert type="error" role="alert" message={error} />}
    <ResponsiveTable<Expense> rowKey="id" loading={loading} dataSource={error ? [] : result?.data ?? []} scroll={{ x: 'max-content' }} locale={{ emptyText: 'За выбранный период расходов нет' }}
      pagination={{ current: page, pageSize: 20, total: error ? 0 : result?.total ?? 0, showSizeChanger: false, onChange: value => update('expensePage', String(value)), showTotal: total => `Всего: ${total}` }} columns={[
        { key: 'date', title: 'Дата', render: (_, row) => cashTime(row.date) },
        { key: 'category', title: 'Статья расхода', render: (_, row) => expenseCategories[row.category] },
        { dataIndex: 'description', title: 'На что', key: 'description' },
        { key: 'method', title: 'Способ оплаты', render: (_, row) => <Tag>{row.paymentMethod === 'CASH' ? 'Наличные' : 'Безнал'}</Tag> },
        { key: 'amount', title: 'Сумма', render: (_, row) => <Typography.Text type="danger">−{currency(row.amount)}</Typography.Text> },
        { key: 'author', title: 'Автор записи', render: (_, row) => row.createdBy.email },
        ...(admin ? [{ key: 'actions', title: 'Действия', render: (_: unknown, row: Expense) => row.isEncashment ? <Tag>Инкассация</Tag> : <Button danger onClick={() => cancel(row)}>Удалить расход</Button> }] : []),
      ]} />
  </Card>
}
