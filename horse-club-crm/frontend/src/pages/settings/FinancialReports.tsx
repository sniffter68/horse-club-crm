import { useEffect, useState } from 'react'
import { Alert, Button, Card, Col, Row, Select, Space, Statistic, Typography } from 'antd'
import { useSearchParams } from 'react-router-dom'
import { API_URL, httpClient, toHttpError } from '../../httpClient'
import { ResponsiveTable } from '../../components/ResponsiveTable'
import { cashTime, currency, operationService, periodRange, type CashOperation, type CashSummary } from '../cash-desk/shared'
import { stablePagination } from '../stable/pagination'

export function FinancialReportsPage() {
  const [params, setParams] = useSearchParams()
  const period = ['today', 'yesterday', 'week', 'month'].includes(params.get('period') ?? '') ? params.get('period')! : 'today'
  const page = stablePagination(params.get('page')).page
  const [data, setData] = useState<CashSummary>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    void Promise.resolve().then(async () => {
      if (controller.signal.aborted) return
      setLoading(true); setError(undefined)
      try {
        const response = await httpClient.get<CashSummary>(`${API_URL}/payments/summary`, { signal: controller.signal,
          params: { ...periodRange(period), page, pageSize: 20 } })
        if (!controller.signal.aborted) setData(response.data)
      } catch (cause) { if (!controller.signal.aborted) setError(toHttpError(cause).message) }
      finally { if (!controller.signal.aborted) setLoading(false) }
    })
    return () => controller.abort()
  }, [period, page, revision])
  return <Space direction="vertical" size="middle" style={{ width: '100%' }}>
    <Typography.Title level={2}>Финансовые отчёты</Typography.Title>
    <Space wrap><Select aria-label="Период отчёта" value={period} onChange={value => setParams({ period: value, page: '1' })}
      options={[{ value: 'today', label: 'Сегодня' }, { value: 'yesterday', label: 'Вчера' }, { value: 'week', label: 'Неделя' }, { value: 'month', label: 'Месяц' }]} />
      <Button disabled={loading} onClick={() => setRevision(value => value + 1)}>Обновить отчёт</Button></Space>
    {error && <Alert role="alert" type="error" showIcon message={error} />}
    <Row gutter={[16, 16]}>{[['Выручка', data?.totalRevenue], ['Наличные', data?.totalCash], ['Безналичные', data?.totalCard]].map(([title, value]) => <Col key={title} xs={24} md={8}>
      <Card loading={loading}><Statistic title={title} value={currency(value)} /></Card>
    </Col>)}</Row>
    <ResponsiveTable<CashOperation> dataSource={data?.operations ?? []} loading={loading} rowKey="id" columns={[
      { title: 'Дата', key: 'date', render: (_, row) => cashTime(row.paidAt || row.createdAt) },
      { title: 'Услуга', key: 'service', render: (_, row) => operationService(row) },
      { title: 'Сумма', key: 'amount', render: (_, row) => currency(row.amount) },
    ]} pagination={{ current: page, pageSize: 20, total: data?.operationsCount ?? 0, showSizeChanger: false,
      onChange: next => setParams({ period, page: String(next) }) }} />
  </Space>
}
