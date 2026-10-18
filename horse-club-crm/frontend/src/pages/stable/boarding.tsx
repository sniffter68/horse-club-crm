import { useState } from 'react'
import { Alert, Button, DatePicker, Form, Input, InputNumber, List, Select, Space, Tag, Typography } from 'antd'
import type { Dayjs } from 'dayjs'
import ruDatePicker from 'antd/es/date-picker/locale/ru_RU'
import { API_URL, httpClient } from '../../httpClient'
import { dateTime } from '../cards/format'
import { money } from '../catalogs/format'
import { useCatalogPermissions } from '../catalogs/permissions'
import { StableEntryModal, StableListState } from './shared'
import { useStableList } from './useStableList'
import { boardingServices, type BoardingExpense } from './types'
import { toInstant } from '../schedule/time'

function AddService({ horseId, onClose, onSaved }: { horseId: string; onClose: () => void; onSaved: () => void }) {
  const [form] = Form.useForm<{ serviceType: string; cost: number; notes?: string }>()
  const [requestId] = useState(() => crypto.randomUUID())
  return <StableEntryModal title="Добавить услугу постоя" form={form} submitLabel="Записать и начислить" onClose={onClose} onSaved={onSaved}
    save={values => httpClient.post(`${API_URL}/boarding/logs`, { ...values, horseId, requestId })}>
    <Typography.Paragraph type="secondary">Стоимость будет начислена владельцу. Повторная отправка этой формы не дублирует услугу.</Typography.Paragraph>
    <Form.Item name="serviceType" label="Услуга" rules={[{ required: true, message: 'Выберите услугу' }]}>
      <Select options={Object.entries(boardingServices).map(([value, label]) => ({ value, label }))} />
    </Form.Item>
    <Form.Item name="cost" label="Стоимость, ₽" rules={[{ required: true, message: 'Укажите стоимость' }, { type: 'number', min: 0, max: 9999999999.99 }]}>
      <InputNumber min={0} max={9999999999.99} precision={2} style={{ width: '100%' }} />
    </Form.Item>
    <Form.Item name="notes" label="Комментарий" rules={[{ max: 2000 }]}><Input.TextArea autoSize={{ minRows: 3, maxRows: 8 }} maxLength={2000} /></Form.Item>
  </StableEntryModal>
}

export function HorseBoardingExpenses({ horseId, privateBoarding }: { horseId: string; privateBoarding: boolean }) {
  const { canManage } = useCatalogPermissions('boarding')
  const [page, setPage] = useState(1)
  const [adding, setAdding] = useState(false)
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null)
  const params = new URLSearchParams({ horseId, limit: '20', offset: String((page - 1) * 20) })
  if (range?.[0]) params.set('from', toInstant(`${range[0].format('YYYY-MM-DD')}T00:00`))
  if (range?.[1]) params.set('to', new Date(+new Date(toInstant(`${range[1].add(1, 'day').format('YYYY-MM-DD')}T00:00`)) - 1).toISOString())
  const query = useStableList<BoardingExpense>(`boarding/expenses?${params}`)
  return <section aria-label="Постой и расходы" className="stable-section">
    <Space wrap>
      <DatePicker.RangePicker locale={ruDatePicker} aria-label="Период расходов" format="DD.MM.YYYY" value={range} onChange={value => { setRange(value); setPage(1) }} />
      {canManage && <Button type="primary" disabled={!privateBoarding} onClick={() => setAdding(true)}>Добавить услугу</Button>}
    </Space>
    {!privateBoarding && <Typography.Paragraph type="secondary">Платные услуги доступны при действующем частном постое.</Typography.Paragraph>}
    {query.result?.ownerAccount && <Alert type={Number(query.result.ownerAccount.boardingBalance) < 0 ? 'warning' : 'success'} showIcon
      message={`Баланс постоя владельца: ${money(query.result.ownerAccount.boardingBalance)}`}
      description="Общий рублёвый счёт постоя владельца по всем его лошадям. Отрицательная сумма — задолженность. Оплаты вносятся в разделе «Оплаты» по договору постоя." />}
    <StableListState {...query} total={query.result?.total ?? 0} page={page} onPage={setPage}>
      <List dataSource={query.result?.data} renderItem={row => <List.Item><div className="stable-row">
        <Space wrap><Tag>{row.boardingDailyLog ? boardingServices[row.boardingDailyLog.serviceType as keyof typeof boardingServices] || row.boardingDailyLog.serviceType : row.billingMonth ? `Постой · ${row.billingMonth}` : 'Оплата / корректировка'}</Tag>
          <strong className="data-mono">{money(row.amount)}</strong><span>{dateTime(row.boardingDailyLog?.performedAt || row.createdAt)}</span></Space>
        <div>{row.boardingDailyLog?.notes || row.description}</div>
        {row.boardingDailyLog?.performedBy && <Typography.Text type="secondary">Выполнил: {row.boardingDailyLog.performedBy}</Typography.Text>}
      </div></List.Item>} />
    </StableListState>
    {adding && <AddService horseId={horseId} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); query.refresh() }} />}
  </section>
}
