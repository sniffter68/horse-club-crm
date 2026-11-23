import { useEffect, useState } from 'react'
import { Alert, Button, Card, DatePicker, Form, Input, InputNumber, Select, Space, Statistic } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import ruDatePicker from 'antd/es/date-picker/locale/ru_RU'
import { API_URL, httpClient, toHttpError } from '../../httpClient'
import { usePermissions } from '../../modulePermissions'
import { isUuid } from '../../uuid'
import { StableEntryModal } from '../stable/shared'
import { personName } from '../cards/format'
import { toInstant, toLocalInput } from '../schedule/time'
import { CashJournal } from './CashJournal'

type Contract = { id: string; clientId: string; horse: { name: string }; client: { name: string; firstName: string; lastName: string } }
const categories = [{ value: 'FEED', label: 'Корма' }, { value: 'BEDDING', label: 'Опилки / подстилка' },
  { value: 'VET_FARRIER', label: 'Ветеринар / коваль' }, { value: 'MAINTENANCE', label: 'Хознужды' }, { value: 'OTHER', label: 'Прочее' }]

export function BoardingCash() {
  const { canWrite } = usePermissions()
  const [balances, setBalances] = useState<{ cash: string; bank: string; total: string; unspecified: string }>()
  const [error, setError] = useState<string>()
  const [revision, setRevision] = useState(0)
  const [operation, setOperation] = useState<'INCOME' | 'EXPENSE'>()
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null)
  useEffect(() => { const refresh = () => setRevision(value => value + 1); window.addEventListener('cash-desk-paid', refresh); return () => window.removeEventListener('cash-desk-paid', refresh) }, [])
  useEffect(() => {
    const controller = new AbortController()
    httpClient.get<typeof balances>(`${API_URL}/payments/boarding-cash`, { signal: controller.signal }).then(({ data }) => { if (!controller.signal.aborted) { setBalances(data); setError(undefined) } })
      .catch(cause => { if (!controller.signal.aborted) setError(toHttpError(cause).message) })
    return () => controller.abort()
  }, [revision])
  return <Card title="Касса постоя" style={{ marginBottom: 20 }} extra={canWrite('CASHBOX') && <Space wrap>
    <Button onClick={() => setOperation('INCOME')}>+ Приход</Button><Button onClick={() => setOperation('EXPENSE')}>− Расход</Button>
  </Space>}>
    {error ? <Alert type="error" message={error} action={<Button onClick={() => setRevision(value => value + 1)}>Повторить</Button>} /> : <Space wrap size="large">
      <Statistic title="Всего" value={balances?.total} groupSeparator=" " decimalSeparator="," precision={2} suffix="₽" loading={!balances} />
      <Statistic title="Наличные (Касса постоя)" value={balances?.cash} groupSeparator=" " decimalSeparator="," precision={2} suffix="₽" loading={!balances} />
      <Statistic title="Расчётный счёт (Р/С)" value={balances?.bank} groupSeparator=" " decimalSeparator="," precision={2} suffix="₽" loading={!balances} />
    </Space>}
    {Number(balances?.unspecified) > 0 && <Alert type="warning" message={`В общем остатке есть оплаты без указанного способа: ${balances?.unspecified} ₽`} />}
    <div style={{ marginBlock: 16 }}><DatePicker.RangePicker aria-label="Период кассы постоя" locale={ruDatePicker} format="DD.MM.YYYY" value={range} onChange={setRange} /></div>
    <CashJournal cashboxType="BOARDING" from={range?.[0] ? toInstant(`${range[0].format('YYYY-MM-DD')}T00:00`) : '2000-01-01T00:00:00+03:00'}
      to={range?.[1] ? toInstant(`${range[1].add(1, 'day').format('YYYY-MM-DD')}T00:00`) : new Date().toISOString()} inactive={false} refresh={revision} />
    {operation && <BoardingOperation kind={operation} onClose={() => setOperation(undefined)} onSaved={() => { setOperation(undefined); window.dispatchEvent(new Event('cash-desk-paid')) }} />}
  </Card>
}

function BoardingOperation({ kind, onClose, onSaved }: { kind: 'INCOME' | 'EXPENSE'; onClose: () => void; onSaved: () => void }) {
  const [form] = Form.useForm<{ method: 'CASH' | 'TRANSFER'; boardingContractId?: string; category?: string; amount: number; date: Dayjs; description: string }>()
  const [requestId] = useState(() => crypto.randomUUID())
  const [contracts, setContracts] = useState<Contract[]>([])
  const [error, setError] = useState<string>()
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    if (kind !== 'INCOME') return
    const controller = new AbortController()
    httpClient.get<Contract[]>(`${API_URL}/payments/boarding-options`, { signal: controller.signal }).then(({ data }) => { if (!controller.signal.aborted) { setContracts(data); setError(undefined) } })
      .catch(cause => { if (!controller.signal.aborted) setError(toHttpError(cause).message) })
    return () => controller.abort()
  }, [kind, revision])
  return <StableEntryModal variant="drawer" title={kind === 'INCOME' ? 'Приход постоя' : 'Расход постоя'} form={form} initialValues={{ method: 'CASH', date: dayjs(toLocalInput(new Date())) }} submitLabel="Провести"
    submitDisabled={Boolean(error)} onClose={onClose} onSaved={onSaved} resources={['payments', 'clients']} save={values => {
      const at = toInstant(values.date.format('YYYY-MM-DDTHH:mm'))
      if (kind === 'EXPENSE') return httpClient.post(`${API_URL}/finance/expenses`, { requestId, cashboxType: 'BOARDING', amount: values.amount,
        paymentMethod: values.method === 'CASH' ? 'CASH' : 'CARD', date: at, category: values.category, description: values.description })
      if (!isUuid(values.boardingContractId || '')) throw new Error('Выберите договор постоя')
      return httpClient.post(`${API_URL}/payments`, { requestId, boardingContractId: values.boardingContractId,
        method: values.method, amount: values.amount, paidAt: at, status: 'PAID', description: values.description })
    }}>
    {error && <Alert type="error" message={error} action={<Button onClick={() => setRevision(value => value + 1)}>Повторить</Button>} />}
    <Form.Item name="method" label="Счёт" rules={[{ required: true }]}><Select options={[{ value: 'CASH', label: 'Касса постоя (наличные)' }, { value: 'TRANSFER', label: 'Расчётный счёт (Р/С)' }]} /></Form.Item>
    {kind === 'INCOME' ? <Form.Item name="boardingContractId" label="Договор / владелец" rules={[{ required: true, message: 'Выберите договор постоя' }]}><Select showSearch optionFilterProp="label" options={contracts.map(row => ({ value: row.id, label: `${personName(row.client)} · ${row.horse.name}` }))} /></Form.Item>
      : <Form.Item name="category" label="Категория расхода" rules={[{ required: true, message: 'Выберите категорию' }]}><Select options={categories} /></Form.Item>}
    <Form.Item name="amount" label="Сумма, ₽" rules={[{ required: true, type: 'number', min: 0.01, max: 9999999999.99 }]}><InputNumber min={0.01} precision={2} style={{ width: '100%' }} /></Form.Item>
    <Form.Item name="date" label="Дата и время (Москва)" rules={[{ required: true }]}><DatePicker locale={ruDatePicker} showTime format="DD.MM.YYYY HH:mm" /></Form.Item>
    <Form.Item name="description" label="Комментарий" rules={[{ required: kind === 'EXPENSE', message: 'Укажите назначение расхода' }, { max: 500 }]}><Input.TextArea maxLength={500} autoSize={{ minRows: 3, maxRows: 8 }} style={{ resize: 'none' }} /></Form.Item>
  </StableEntryModal>
}
