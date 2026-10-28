import { useEffect, useState } from 'react'
import { Alert, App, Button, Card, Col, DatePicker, Descriptions, Modal, Row, Space, Statistic, Tag } from 'antd'
import dayjs from 'dayjs'
import { DateTime } from 'luxon'
import ruDatePicker from 'antd/es/date-picker/locale/ru_RU'
import { API_URL, httpClient, toHttpError } from '../../httpClient'
import { currency } from './shared'

type Closing = { year: number; month: number; isClosed: boolean; closedAt: string | null;
  cashFlowIncome: string; cashFlowExpense: string; recognizedRevenue: string;
  deferredRevenueCarriedOver: string; activeMembershipsCarriedOver: number }

export function MonthlyClosingPanel({ admin, refresh }: { admin: boolean; refresh: number }) {
  const [period, setPeriod] = useState(() => DateTime.now().setZone('Europe/Moscow').toFormat('yyyy-MM'))
  const [result, setResult] = useState<{ key: string; data?: Closing; error?: string }>()
  const [closingError, setClosingError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [revision, setRevision] = useState(0)
  const { message } = App.useApp()
  const [year, month] = period.split('-').map(Number)
  const key = `${period}:${refresh}:${revision}`
  const data = result?.key === key ? result.data : undefined
  const error = result?.key === key ? result.error : undefined
  const loading = result?.key !== key
  useEffect(() => {
    const controller = new AbortController()
    void httpClient.get<Closing>(`${API_URL}/finance/monthly-closing/status`, { params: { year, month }, signal: controller.signal })
      .then(response => { if (!controller.signal.aborted) setResult({ key, data: response.data }) })
      .catch(cause => { if (!controller.signal.aborted) setResult({ key, error: toHttpError(cause).message }) })
    return () => controller.abort()
  }, [year, month, key])
  const close = async () => {
    if (busy || !data) return
    setBusy(true); setClosingError(undefined)
    try {
      const response = await httpClient.post<Closing>(`${API_URL}/finance/monthly-closing/close`, { year, month })
      setResult({ key, data: response.data }); setConfirming(false); void message.success('Месяц закрыт. Неиспользованные занятия перенесены')
    } catch (cause) { setClosingError(toHttpError(cause).message) }
    finally { setBusy(false) }
  }
  const ended = period < DateTime.now().setZone('Europe/Moscow').toFormat('yyyy-MM')
  return <Card title="Учет выручки по месяцам" styles={{ header: { flexWrap: 'wrap', gap: 8 }, title: { whiteSpace: 'normal', paddingBlock: 12 }, extra: { paddingBlock: 8 } }}
    extra={<Tag className={`crm-tag crm-tag--${data?.isClosed ? 'success' : 'accent'}`}>{data ? data.isClosed ? 'Месяц закрыт' : 'Месяц открыт' : loading ? 'Загрузка отчета' : 'Отчет недоступен'}</Tag>}>
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Space wrap>
        <DatePicker picker="month" locale={ruDatePicker} aria-label="Месяц финансового отчета" allowClear={false}
          format="MM.YYYY" value={dayjs(`${period}-01`)} disabled={busy || confirming} onChange={value => { if (value) setPeriod(value.format('YYYY-MM')) }} />
        <Button loading={loading} disabled={busy} onClick={() => setRevision(v => v + 1)}>Обновить показатели</Button>
        {admin && !data?.isClosed && <Button disabled={loading || !data || !ended || busy} onClick={() => { setClosingError(undefined); setConfirming(true) }}>Закрыть месяц</Button>}
      </Space>
      {error && !confirming && <Alert type="error" role="alert" showIcon message="Не удалось загрузить отчет" description={error} />}
      <Row gutter={[16, 16]}>{[
        ['Поступления в кассу', data?.cashFlowIncome], ['Признанная выручка', data?.recognizedRevenue],
        ['Переходящий остаток абонементов', data?.deferredRevenueCarriedOver],
      ].map(([title, value]) => <Col xs={24} md={8} key={title}><Statistic title={title} value={data ? currency(value) : '—'} loading={loading} /></Col>)}</Row>
      <Alert type="info" showIcon message="Оплата абонемента сразу поступает в кассу. Выручка признается в дату проведенного занятия. Остаток занятий переносится без повторного поступления денег." />
    </Space>
    <Modal open={confirming} title={`Закрыть месяц ${period}?`} okText="Закрыть месяц" cancelText="Вернуться к отчету"
      onOk={() => void close()} onCancel={() => { if (!busy) setConfirming(false) }} confirmLoading={busy}
      cancelButtonProps={{ disabled: busy, autoFocus: true }} closable={!busy} keyboard={!busy} maskClosable={false} focusTriggerAfterClose>
      <p>Итоги месяца будут сохранены. Изменять проведенные занятия и кассовые операции этого месяца будет нельзя. Неиспользованные занятия сохранятся.</p>
      {data && <Descriptions column={1} items={[
        { key: 'cash', label: 'Поступления в кассу', children: currency(data.cashFlowIncome) },
        { key: 'earned', label: 'Признанная выручка', children: currency(data.recognizedRevenue) },
        { key: 'carry', label: 'Перенос авансов', children: currency(data.deferredRevenueCarriedOver) },
        { key: 'count', label: 'Абонементов к переносу', children: data.activeMembershipsCarriedOver },
      ]} />}
      {closingError && <Alert type="error" role="alert" showIcon message="Не удалось закрыть месяц" description={closingError} />}
    </Modal>
  </Card>
}
