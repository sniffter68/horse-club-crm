import { useEffect, useState } from 'react'
import { Alert, App, Button, Card, Col, Collapse, DatePicker, Descriptions, Input, Modal, Row, Space, Spin, Statistic, Tag } from 'antd'
import dayjs from 'dayjs'
import { DateTime } from 'luxon'
import ruDatePicker from 'antd/es/date-picker/locale/ru_RU'
import { API_URL, httpClient, toHttpError } from '../../httpClient'
import { currency } from './shared'
import { ResponsiveTable } from '../../components/ResponsiveTable'

type AdvanceRow = { membershipId: string; clientId: string | null; clientName: string; membershipTitle: string;
  remainingLessons: number; pricePerLesson: string; amountToCarryOver: string }
type Closing = { year: number; month: number; isClosed: boolean; closedAt: string | null;
  cashFlowIncome: string; cashFlowExpense: string; recognizedRevenue: string;
  deferredRevenueCarriedOver: string; activeMembershipsCarriedOver: number; currentCashBalance: string;
  membershipsAdvanceSummary: { totalAdvance: string; rows: AdvanceRow[] };
  notes?: string | null;
  openingBalance: { incomingCashBalance: string; incomingAdvanceBalance: string } | null }

export function MonthlyClosingPanel({ canClose, refresh }: { canClose: boolean; refresh: number }) {
  const [period, setPeriod] = useState(() => DateTime.now().setZone('Europe/Moscow').toFormat('yyyy-MM'))
  const [result, setResult] = useState<{ key: string; data?: Closing; error?: string }>()
  const [closingError, setClosingError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [revision, setRevision] = useState(0)
  const [preview, setPreview] = useState<{ key: string; data?: Closing; error?: string }>()
  const [notes, setNotes] = useState('')
  const { message } = App.useApp()
  const [year, month] = period.split('-').map(Number)
  const key = `${period}:${refresh}:${revision}`
  const data = result?.key === key ? result.data : undefined
  const error = result?.key === key ? result.error : undefined
  const loading = result?.key !== key
  const reconciliation = preview?.key === key ? preview.data : undefined
  const previewError = preview?.key === key ? preview.error : undefined
  const previewLoading = preview?.key !== key
  const nextMonth = DateTime.fromObject({ year, month, day: 1 }, { zone: 'Europe/Moscow' }).plus({ months: 1 }).setLocale('ru').toFormat('LLLL yyyy')
  useEffect(() => {
    const controller = new AbortController()
    void httpClient.get<Closing>(`${API_URL}/finance/monthly-closing/status`, { params: { year, month }, signal: controller.signal })
      .then(response => { if (!controller.signal.aborted) setResult({ key, data: response.data }) })
      .catch(cause => { if (!controller.signal.aborted) setResult({ key, error: toHttpError(cause).message }) })
    return () => controller.abort()
  }, [year, month, key])
  useEffect(() => {
    if (!confirming) return
    const controller = new AbortController()
    void httpClient.get<Closing>(`${API_URL}/finance/monthly-closing/preview`, { params: { year, month }, signal: controller.signal })
      .then(response => { if (!controller.signal.aborted) setPreview({ key, data: response.data }) })
      .catch(cause => { if (!controller.signal.aborted) setPreview({ key, error: toHttpError(cause).message }) })
    return () => controller.abort()
  }, [confirming, year, month, key])
  const close = async () => {
    if (!canClose || busy || !reconciliation || reconciliation.isClosed) return
    setBusy(true); setClosingError(undefined)
    try {
      const response = await httpClient.post<Closing>(`${API_URL}/finance/monthly-closing/confirm`, { year, month, ...(notes.trim() ? { notes: notes.trim() } : {}) })
      setResult({ key, data: response.data }); setConfirming(false); void message.success('Месяц закрыт. Остаток кассы и авансы перенесены')
    } catch (cause) {
      const error = toHttpError(cause)
      setClosingError(error.message)
      if (error.statusCode === 409) setRevision(value => value + 1)
    }
    finally { setBusy(false) }
  }
  const isCurrentMonth = period === DateTime.now().setZone('Europe/Moscow').toFormat('yyyy-MM')
  const viewingClosed = data?.isClosed || reconciliation?.isClosed
  return <Card title="Учет выручки по месяцам" styles={{ header: { flexWrap: 'wrap', gap: 8 }, title: { whiteSpace: 'normal', paddingBlock: 12 }, extra: { paddingBlock: 8 } }}
    extra={<Tag className={`crm-tag crm-tag--${data?.isClosed ? 'success' : 'accent'}`}>{data ? data.isClosed ? 'Месяц закрыт' : 'Месяц открыт' : loading ? 'Загрузка отчета' : 'Отчет недоступен'}</Tag>}>
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Space wrap>
        <DatePicker picker="month" locale={ruDatePicker} aria-label="Месяц финансового отчета" allowClear={false}
          format="MM.YYYY" value={dayjs(`${period}-01`)} disabled={busy || confirming} onChange={value => { if (value) setPeriod(value.format('YYYY-MM')) }} />
        <Button loading={loading} disabled={busy || confirming} onClick={() => setRevision(v => v + 1)}>Обновить показатели</Button>
        {(canClose || data?.isClosed) && <Button disabled={loading || !data || busy || confirming} onClick={() => { setClosingError(undefined); setPreview(undefined); setNotes(''); setConfirming(true) }}>{data?.isClosed ? 'Просмотр отчета закрытия' : 'Закрыть месяц'}</Button>}
      </Space>
      {data?.openingBalance && <Alert type="info" showIcon message={`Перенесено с прошлого месяца: Касса ${currency(data.openingBalance.incomingCashBalance)} | Авансы по абонементам ${currency(data.openingBalance.incomingAdvanceBalance)}`} />}
      {error && !confirming && <Alert type="error" role="alert" showIcon message="Не удалось загрузить отчет" description={error} />}
      <Row gutter={[16, 16]}>{[
        ['Поступления в кассу', data?.cashFlowIncome], ['Признанная выручка', data?.recognizedRevenue],
        ['Переходящий остаток абонементов', data?.deferredRevenueCarriedOver],
      ].map(([title, value]) => <Col xs={24} md={8} key={title}><Statistic title={title} value={data ? currency(value) : '—'} loading={loading} /></Col>)}</Row>
      <Alert type="info" showIcon message="Оплата абонемента сразу поступает в кассу. Выручка признается в дату проведенного занятия. Остаток занятий переносится без повторного поступления денег." />
    </Space>
    <Modal className="cash-desk-modal" open={confirming} title={viewingClosed ? 'Отчет закрытия месяца' : 'Закрытие месяца и перенос сальдо'} width={900}
      style={{ top: 16 }} styles={{ body: { maxHeight: 'calc(100dvh - 280px)', overflowY: 'auto' } }}
      okText={`Подтвердить и перенести остатки в ${nextMonth}`} cancelText="Вернуться к отчету"
      onOk={() => void close()} onCancel={() => { if (!busy) setConfirming(false) }} confirmLoading={busy}
      okButtonProps={{ disabled: !canClose || !reconciliation || reconciliation.isClosed || busy, style: { display: viewingClosed || !canClose ? 'none' : undefined, whiteSpace: 'normal', height: 'auto', minHeight: 40, maxWidth: '100%' } }}
      cancelButtonProps={{ disabled: busy, autoFocus: true }} closable={!busy} keyboard={!busy} maskClosable={false} focusTriggerAfterClose>
      <p>{viewingClosed ? `Зафиксированная ведомость за ${period}.` : `Сверка за ${period}. Итоги месяца будут сохранены. Изменять проведенные занятия и кассовые операции этого месяца будет нельзя. Неиспользованные занятия сохранятся.`}</p>
      {isCurrentMonth && !viewingClosed && <Alert type="info" showIcon message="Текущий месяц еще не завершен. Закрытие зафиксирует текущую признанную выручку и перенесет остаток кассы и авансы по абонементам во входящее сальдо следующего месяца" />}
      {previewLoading && <Spin aria-label="Загрузка сверки" />}
      {previewError && <Alert type="error" role="alert" showIcon message="Не удалось загрузить сверку" description={previewError}
        action={<Button onClick={() => setRevision(v => v + 1)}>Повторить</Button>} />}
      {reconciliation && <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <p>Остаток денег включает наличные и счет. Деньги и неиспользованные занятия сверяются на момент закрытия; выручка и расходы — за выбранный месяц.</p>
        {reconciliation.isClosed && <Alert type="warning" showIcon message="Месяц уже закрыт. Остатки уже перенесены" />}
        <Descriptions column={1} layout="vertical" styles={{ content: { whiteSpace: 'nowrap' } }} items={[
          { key: 'cash', label: 'Фактический остаток денег в кассе на конец месяца', children: currency(reconciliation.currentCashBalance) },
          { key: 'carry', label: 'Сумма авансов по неоткатанным абонементам', children: currency(reconciliation.membershipsAdvanceSummary.totalAdvance) },
          { key: 'earned', label: 'Фактическая признанная выручка', children: currency(reconciliation.recognizedRevenue) },
          { key: 'expenses', label: 'Расходы клуба за месяц', children: currency(reconciliation.cashFlowExpense) },
        ]} />
        <Collapse items={[{ key: 'clients', label: 'Кому и сколько занятий переносим', children:
          <ResponsiveTable<AdvanceRow> rowKey="membershipId" size="small" dataSource={reconciliation.membershipsAdvanceSummary.rows}
            pagination={{ pageSize: 10, hideOnSinglePage: true }} locale={{ emptyText: 'Нет неиспользованных занятий для переноса' }}
            columns={[
              { title: 'Клиент', dataIndex: 'clientName' }, { title: 'Абонемент', dataIndex: 'membershipTitle' },
              { title: 'Осталось занятий', dataIndex: 'remainingLessons' },
              { title: 'Цена занятия', dataIndex: 'pricePerLesson', render: value => currency(value) },
              { title: 'Аванс к переносу', dataIndex: 'amountToCarryOver', render: value => currency(value) },
            ]} />,
        }]} />
        {!viewingClosed && <><label htmlFor="closing-notes">Комментарий к закрытию (необязательно)</label>
        <Input.TextArea id="closing-notes" value={notes} onChange={event => setNotes(event.target.value)} maxLength={2000}
          autoSize={{ minRows: 2, maxRows: 5 }} style={{ resize: 'none' }} disabled={busy} /></>}
        {viewingClosed && reconciliation.notes && <p>Комментарий к закрытию: {reconciliation.notes}</p>}
      </Space>}
      {closingError && <Alert type="error" role="alert" showIcon message="Не удалось закрыть месяц" description={closingError} />}
    </Modal>
  </Card>
}
