import { useCallback, useEffect, useState } from 'react'
import { Alert, App, Button, Card, Select, Space, Tag } from 'antd'
import { useSearchParams } from 'react-router-dom'
import { LiveSearch } from '../../components/LiveSearch'
import { ResponsiveTable } from '../../components/ResponsiveTable'
import { API_URL, httpClient, toHttpError } from '../../httpClient'
import { cashTime, currency } from './shared'
import { isUuid } from '../../uuid'
import { PaymentEditDrawer } from '../payments/PaymentEditDrawer'
import type { Payment } from '../payments/types'
import { usePermissions } from '../../modulePermissions'

interface JournalRow {
  id: string; kind: 'INCOME' | 'EXPENSE'; at: string; amount: string; method: string
  clientName: string | null; description: string | null; cashier: string | null
}

export function CashJournal({ from, to, shiftId, inactive, refresh, cashboxType }: {
  from: string | null; to: string | null; shiftId?: string; inactive: boolean; refresh: number; cashboxType?: 'BOARDING'
}) {
  const { canWrite } = usePermissions()
  const { message } = App.useApp()
  const [editing, setEditing] = useState<Payment>()
  const [editingId, setEditingId] = useState<string>()
  const edit = async (row: JournalRow) => {
    const id = row.id.replace(/^payment:/, '')
    if (!isUuid(id) || editingId) return
    setEditingId(id)
    try { const { data } = await httpClient.get<Payment>(`${API_URL}/payments/${id}`); setEditing(data) }
    catch (cause) { void message.error(toHttpError(cause).message) }
    finally { setEditingId(undefined) }
  }
  const [params, setParams] = useSearchParams()
  const page = Math.max(1, Number(params.get('page')) || 1)
  const paymentMethod = params.get('method') || '', operationType = params.get('operation') || '', search = params.get('search') || ''
  const requestedShift = params.get('journalShift') || ''
  const invalidShift = Boolean(!shiftId && requestedShift && !isUuid(requestedShift))
  const selectedShift = shiftId || (!invalidShift && requestedShift) || undefined
  const [draft, setDraft] = useState(search)
  const [result, setResult] = useState<{ data: JournalRow[]; total: number }>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [revision, retry] = useState(0)
  const update = useCallback((key: string, value: string) => {
    const next = new URLSearchParams(window.location.search)
    if (value) next.set(key, value); else next.delete(key)
    if (key !== 'page') next.set('page', '1')
    setParams(next)
  }, [setParams])
  // Synchronize the editable search with browser Back/Forward and committed URL filters.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setDraft(search), [search])
  useEffect(() => {
    const controller = new AbortController()
    // Request lifecycle state is scoped to the cancelable network operation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(undefined)
    if (inactive || invalidShift) { setResult({ data: [], total: 0 }); setLoading(false); return }
    setLoading(true)
    httpClient.get<{ data: JournalRow[]; total: number }>(`${API_URL}/finance/journal`, {
      params: { from, to, cashboxType, shiftId: selectedShift, page, pageSize: 20, paymentMethod: paymentMethod || undefined, operationType: operationType || undefined, search: search || undefined }, signal: controller.signal,
    }).then(({ data }) => {
      if (controller.signal.aborted) return
      if (page > 1 && data.total <= (page - 1) * 20) update('page', String(Math.max(1, Math.ceil(data.total / 20))))
      else setResult(data)
    }).catch(cause => { if (!controller.signal.aborted) setError(toHttpError(cause).message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  // URL primitives own the journal filters.
  }, [from, to, cashboxType, selectedShift, invalidShift, page, paymentMethod, operationType, search, inactive, refresh, revision, update])
  return <Card title="Кассовая книга" extra={!error && !loading ? `Операций: ${result?.total ?? 0}` : undefined}>
    <Space direction="vertical" size={24} style={{ width: '100%' }}>
      <div className="cash-journal-filters">
        <LiveSearch value={draft} onChange={setDraft} onSearch={value => { if (value !== search) update('search', value) }} aria-label="Поиск по клиенту или комментарию" placeholder="Клиент или комментарий" />
        <Select aria-label="Способ оплаты журнала" value={paymentMethod} onChange={value => update('method', value)} options={[{ value: '', label: cashboxType ? 'Все каналы' : 'Все способы оплаты' }, { value: 'CASH', label: cashboxType ? 'Касса постоя (нал)' : 'Наличные' }, { value: 'BANK', label: cashboxType ? 'Р/С' : 'Безналичные' }]} />
        <Select aria-label="Тип операции" value={operationType} onChange={value => update('operation', value)} options={[{ value: '', label: 'Все операции' }, { value: 'INCOME', label: 'Приход' }, { value: 'EXPENSE', label: 'Расход' }]} />
        <JournalShiftFilter value={selectedShift || ''} disabled={Boolean(shiftId)} refresh={refresh} onChange={value => update('journalShift', value)} />
      </div>
      {invalidShift && <Alert type="warning" message="Некорректная смена" action={<Button onClick={() => update('journalShift', '')}>Сбросить смену</Button>} />}
      {error && <Alert role="alert" type="error" showIcon message="Не удалось загрузить журнал" description={error} action={<Button onClick={() => retry(value => value + 1)}>Повторить</Button>} />}
      <ResponsiveTable<JournalRow> className="crm-entity-table" tableLayout="fixed" size="small" rowKey="id" dataSource={error ? [] : result?.data ?? []} loading={loading}
        locale={{ emptyText: error ? 'Журнал недоступен' : search || paymentMethod || operationType ? 'По выбранным фильтрам операций нет' : 'За выбранный период операций нет' }}
        pagination={{ current: page, pageSize: 20, total: error ? 0 : result?.total ?? 0, showSizeChanger: false, onChange: value => update('page', String(value)), showTotal: total => `Всего: ${total}` }} columns={[
          { key: 'at', title: 'Время', render: (_, row) => cashTime(row.at) },
          { key: 'kind', title: 'Операция', render: (_, row) => <Tag color={row.kind === 'INCOME' ? 'success' : 'error'}>{row.kind === 'INCOME' ? '+ Приход' : '− Расход'}</Tag> },
          { key: 'client', title: 'Клиент', render: (_, row) => row.clientName || '—' },
          { key: 'description', title: 'Комментарий / основание', dataIndex: 'description' },
          { key: 'amount', title: 'Сумма', render: (_, row) => <span className="tabular-nums whitespace-nowrap">{row.kind === 'EXPENSE' ? '−' : '+'}{currency(row.amount)}</span> },
          { key: 'method', title: 'Способ оплаты', render: (_, row) => <Tag color={row.method === 'CASH' ? 'green' : 'blue'}>{cashboxType && row.method !== 'UNSPECIFIED' ? row.method === 'CASH' ? 'Нал' : 'Р/С' : ({ CASH: 'Наличные', CARD: 'Карта', CARD_TERMINAL: 'Терминал', SBP: 'СБП', TRANSFER: 'Р/С (Перевод)' } as Record<string, string>)[row.method] || 'Не указан'}</Tag> },
          { key: 'cashier', title: 'Администратор', render: (_, row) => row.cashier || 'Ранее внесённая операция' },
          { key: 'edit', title: 'Действия', render: (_, row) => row.kind === 'INCOME' && canWrite('CASHBOX') && <Button size="small" loading={editingId === row.id.replace(/^payment:/, '')} onClick={() => void edit(row)}>Изменить</Button> },
        ]} />
    </Space>
    {editing && <PaymentEditDrawer payment={editing} onClose={() => setEditing(undefined)} onSaved={() => { setEditing(undefined); retry(value => value + 1) }} />}
  </Card>
}

function JournalShiftFilter({ value, disabled, refresh, onChange }: { value: string; disabled: boolean; refresh: number; onChange: (value: string) => void }) {
  const [shifts, setShifts] = useState<Array<{ id: string; openedAt: string; closedAt: string | null; cashier?: { email: string } }>>([])
  const [error, setError] = useState(false)
  const [revision, retry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    httpClient.get<typeof shifts>(`${API_URL}/payments/shifts`, { signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) { setShifts(data); setError(false) } })
      .catch(() => { if (!controller.signal.aborted) setError(true) })
    return () => controller.abort()
  }, [refresh, revision])
  if (error) return <Button onClick={() => retry(number => number + 1)}>Повторить загрузку смен</Button>
  return <Select aria-label="Смена журнала" value={value} disabled={disabled} onChange={onChange} options={[
    { value: '', label: 'Все смены' }, ...shifts.map(shift => ({ value: shift.id, label: `${cashTime(shift.openedAt)} · ${shift.cashier?.email || 'Кассир'} · ${shift.closedAt ? 'Закрыта' : 'Открыта'}` })),
  ]} />
}
