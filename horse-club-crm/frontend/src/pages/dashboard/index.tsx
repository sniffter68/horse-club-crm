import { useCallback, useEffect, useRef, useState } from 'react'
import { useOnError } from '@refinedev/core'
import type { ColumnsType } from 'antd/es/table'
import { Alert, App, Button, Card, Col, Grid, List, Progress, Row, Space, Statistic, Table, Tag, Typography } from 'antd'
import { Link } from 'react-router-dom'
import { API_URL, httpClient, toHttpError } from '../../httpClient'
import { PendingLeads, type PendingLead } from './PendingLeads'

const DASHBOARD_REFRESH_INTERVAL_MS = 15_000

type FinalLessonStatus = 'COMPLETED' | 'NO_SHOW'

interface LoadSummaryOptions {
  signal?: AbortSignal
  silent?: boolean
}

interface DashboardAlertBooking {
  id: string
  client: { id: string; name: string; firstName: string; lastName: string }
  horse: { id: string; name: string } | null
  membershipId: string | null
}

interface DashboardAlert {
  id: string
  startTime: string
  endTime: string
  trainer: { id: string; name: string }
  service: { id: string; name: string; title: string }
  bookings: DashboardAlertBooking[]
  unlinkedBookingsCount: number
  hasUnlinkedMembership: boolean
}

interface HorseWorkload {
  horseId: string
  horseName: string
  maxDailyMinutes: number
  usedMinutes: number
  remainingMinutes: number
  loadPercent: number
}

interface DashboardSummary {
  generatedAt: string
  workDay: { date: string; openAt: string; closeAt: string; timeZone: string }
  alerts: DashboardAlert[]
  horseWorkloads: HorseWorkload[]
  leadRequests: PendingLead[]
  kpi: {
    lessonsTotal: number
    lessonsCompleted: number
    newLeads: number
    activeMemberships: number
  }
}

interface UpdatedLesson {
  id: string
  bookings: Array<{
    membership: {
      id: string
      remainedLessons: number
      validUntil: string
    } | null
  }>
}

const clientName = (booking: DashboardAlertBooking): string =>
  [booking.client.firstName, booking.client.lastName].filter(Boolean).join(' ') ||
  booking.client.name ||
  booking.client.id

function workloadColor(percent: number): string {
  if (percent >= 100) return '#cf1322'
  if (percent >= 75) return '#1677ff'
  return '#389e0d'
}

export function DashboardPage() {
  const screens = Grid.useBreakpoint()
  const isMobile = !screens.md
  const { message, notification } = App.useApp()
  const { mutate: onError } = useOnError()
  const onErrorRef = useRef(onError)
  useEffect(() => { onErrorRef.current = onError }, [onError])

  const [summary, setSummary] = useState<DashboardSummary>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(() => new Set())
  const updatingIdsRef = useRef<Set<string>>(new Set())
  const knownLeadIdsRef = useRef<Set<string> | undefined>(undefined)
  const loadingSummaryRef = useRef(false)

  const reportError = useCallback((cause: unknown) => {
    const failure = toHttpError(cause)
    setError(failure.message)
    if (failure.statusCode === 401) onErrorRef.current(failure)
  }, [])

  const loadSummary = useCallback(async ({ signal, silent = false }: LoadSummaryOptions = {}) => {
    if (loadingSummaryRef.current) return
    loadingSummaryRef.current = true
    if (!silent) {
      setLoading(true)
      setError(undefined)
    }
    try {
      const response = await httpClient.get<DashboardSummary>(`${API_URL}/dashboard/summary`, { signal })
      if (!signal?.aborted) {
        const nextLeadIds = new Set(response.data.leadRequests.map(lead => lead.id))
        const knownLeadIds = knownLeadIdsRef.current
        if (knownLeadIds) {
          const newLeads = response.data.leadRequests.filter(lead => !knownLeadIds.has(lead.id))
          if (newLeads.length) {
            notification.info({
              key: 'dashboard-new-leads',
              message: newLeads.length === 1 ? 'Новая заявка с сайта' : `Новые заявки с сайта: ${newLeads.length}`,
              description: newLeads.length === 1 ? `${newLeads[0].firstName}, ${newLeads[0].phone}` : 'Откройте раздел новых заявок на дашборде.',
              placement: 'topRight',
              duration: 8,
            })
          }
        }
        knownLeadIdsRef.current = nextLeadIds
        setSummary(response.data)
        setError(undefined)
      }
    } catch (cause) {
      if (!signal?.aborted) {
        if (silent) {
          const failure = toHttpError(cause)
          if (failure.statusCode === 401) onErrorRef.current(failure)
        } else {
          reportError(cause)
        }
      }
    } finally {
      if (!signal?.aborted) setLoading(false)
      loadingSummaryRef.current = false
    }
  }, [notification, reportError])

  useEffect(() => {
    const controller = new AbortController()
    // oxlint-disable-next-line react/set-state-in-effect
    void loadSummary({ signal: controller.signal })
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        void loadSummary({ signal: controller.signal, silent: true })
      }
    }
    const intervalId = window.setInterval(refreshWhenVisible, DASHBOARD_REFRESH_INTERVAL_MS)
    window.addEventListener('focus', refreshWhenVisible)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      controller.abort()
      window.clearInterval(intervalId)
      window.removeEventListener('focus', refreshWhenVisible)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [loadSummary])

  const updateStatus = useCallback(async (lessonId: string, status: FinalLessonStatus) => {
    if (updatingIdsRef.current.has(lessonId)) return
    updatingIdsRef.current.add(lessonId)
    setUpdatingIds(current => new Set(current).add(lessonId))
    setError(undefined)
    try {
      const response = await httpClient.patch<UpdatedLesson>(
        `${API_URL}/lessons/${lessonId}/status`,
        { status },
      )
      const now = Date.now()
      const membershipsMadeInactive = new Set(
        response.data.bookings
          .map(booking => booking.membership)
          .filter((membership): membership is NonNullable<typeof membership> =>
            membership !== null &&
            membership.remainedLessons === 0 &&
            new Date(membership.validUntil).getTime() >= now,
          )
          .map(membership => membership.id),
      ).size
      setSummary(current => current ? {
        ...current,
        alerts: current.alerts.filter(alert => alert.id !== lessonId),
        kpi: {
          ...current.kpi,
          lessonsCompleted: current.kpi.lessonsCompleted + (status === 'COMPLETED' ? 1 : 0),
          activeMemberships: Math.max(0, current.kpi.activeMemberships - membershipsMadeInactive),
        },
      } : current)
      void message.success(status === 'COMPLETED' ? 'Занятие отмечено как проведённое' : 'Неявка зафиксирована')
    } catch (cause) {
      reportError(cause)
    } finally {
      updatingIdsRef.current.delete(lessonId)
      setUpdatingIds(current => {
        const next = new Set(current)
        next.delete(lessonId)
        return next
      })
    }
  }, [message, reportError])

  const removeProcessedLead = useCallback((leadId: string) => {
    setSummary(current => current ? {
      ...current,
      leadRequests: current.leadRequests.filter(lead => lead.id !== leadId),
      kpi: { ...current.kpi, newLeads: Math.max(0, current.kpi.newLeads - 1) },
    } : current)
  }, [])

  const timeFormatter = new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: summary?.workDay.timeZone,
  })
  const formatTime = (value: string): string => timeFormatter.format(new Date(value))
  const renderBookings = (row: DashboardAlert) => row.bookings.length ? <Space direction="vertical" size={4}>
    {row.bookings.map(booking => <Space key={booking.id} wrap size={4}>
      <Link to={`/clients/edit/${booking.client.id}`}>{clientName(booking)}</Link>
      {booking.horse && <Link to={`/horses/edit/${booking.horse.id}`}><Tag>{booking.horse.name}</Tag></Link>}
      {!booking.membershipId && <Link to="/memberships/new"><Tag color="warning">Без абонемента</Tag></Link>}
    </Space>)}
  </Space> : <Typography.Text type="secondary">Нет участников</Typography.Text>

  const alertColumns: ColumnsType<DashboardAlert> = [
    {
      title: 'Время',
      key: 'time',
      width: 130,
      render: (_, row) => <Link to="/schedule" title="Открыть расписание">
        {formatTime(row.startTime)}–{formatTime(row.endTime)}
      </Link>,
    },
    {
      title: 'Занятие',
      key: 'lesson',
      render: (_, row) => <Space direction="vertical" size={0}>
        <Link to={`/services/edit/${row.service.id}`}><Typography.Text strong>{row.service.title || row.service.name}</Typography.Text></Link>
        <Link to={`/trainers/edit/${row.trainer.id}`}><Typography.Text type="secondary">{row.trainer.name}</Typography.Text></Link>
      </Space>,
    },
    {
      title: 'Клиенты и лошади',
      key: 'bookings',
      render: (_, row) => renderBookings(row),
    },
    {
      title: 'Действия',
      key: 'actions',
      width: 230,
      render: (_, row) => {
        const updating = updatingIds.has(row.id)
        return <Space wrap>
          <Button type="primary" loading={updating} disabled={updating} onClick={() => void updateStatus(row.id, 'COMPLETED')}>Был</Button>
          <Button danger loading={updating} disabled={updating} onClick={() => void updateStatus(row.id, 'NO_SHOW')}>Не явился</Button>
        </Space>
      },
    },
  ]

  return <Space className="dashboard-page" direction="vertical" size={isMobile ? 'middle' : 'large'} style={{ width: '100%' }}>
    <Space className="dashboard-header" align="center" wrap style={{ justifyContent: 'space-between', width: '100%' }}>
      <div>
        <Typography.Title level={2} style={{ marginBottom: 0 }}>Главная панель</Typography.Title>
        {summary && <Space direction="vertical" size={0}>
          <Typography.Text type="secondary">Рабочий день: {formatTime(summary.workDay.openAt)}–{formatTime(summary.workDay.closeAt)}</Typography.Text>
          <Typography.Text type="secondary">Автообновление каждые 15 секунд · обновлено {new Date(summary.generatedAt).toLocaleTimeString('ru-RU')}</Typography.Text>
        </Space>}
      </div>
      <Button className="dashboard-refresh" onClick={() => void loadSummary()} loading={loading}>Обновить</Button>
    </Space>

    {error && <Alert type="error" showIcon message="Не удалось загрузить сводку" description={error} />}

    <Row gutter={[16, 16]}>
      <Col xs={24} sm={12} lg={8}>
        <Link className="dashboard-kpi-link" to="/schedule" aria-label="Открыть расписание">
          <Card hoverable><Statistic title="Тренировки сегодня" value={summary?.kpi.lessonsCompleted ?? 0} suffix={`/ ${summary?.kpi.lessonsTotal ?? 0}`} loading={loading && !summary} /></Card>
        </Link>
      </Col>
      <Col xs={24} sm={12} lg={8}>
        <a className="dashboard-kpi-link" href="#pending-leads" aria-label="Открыть новые заявки">
          <Card hoverable><Statistic title="Необработанные заявки" value={summary?.kpi.newLeads ?? 0} loading={loading && !summary} /></Card>
        </a>
      </Col>
      <Col xs={24} sm={12} lg={8}>
        <Link className="dashboard-kpi-link" to="/memberships" aria-label="Открыть абонементы">
          <Card hoverable><Statistic title="Активные абонементы" value={summary?.kpi.activeMemberships ?? 0} loading={loading && !summary} /></Card>
        </Link>
      </Col>
    </Row>

    <PendingLeads leads={summary?.leadRequests ?? []} loading={loading && !summary} onProcessed={removeProcessedLead} />

    <Card title={<Space><Link to="/schedule">Требуют внимания</Link>{summary && <Tag color={summary.alerts.length ? 'error' : 'success'}>{summary.alerts.length}</Tag>}</Space>}>
      {isMobile ? <List<DashboardAlert>
        loading={loading && !summary}
        dataSource={summary?.alerts ?? []}
        locale={{ emptyText: 'Занятий без отметки нет' }}
        renderItem={row => {
          const updating = updatingIds.has(row.id)
          return <List.Item className="dashboard-alert-item">
            <Card size="small" title={<Link to="/schedule">{formatTime(row.startTime)}–{formatTime(row.endTime)}</Link>}
              extra={row.hasUnlinkedMembership ? <Tag color="warning">Без абонемента</Tag> : undefined}>
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                <div>
                  <Link to={`/services/edit/${row.service.id}`}><Typography.Text strong>{row.service.title || row.service.name}</Typography.Text></Link>
                  <br />
                  <Link to={`/trainers/edit/${row.trainer.id}`}><Typography.Text type="secondary">{row.trainer.name}</Typography.Text></Link>
                </div>
                {renderBookings(row)}
                <div className="dashboard-alert-actions">
                  <Button type="primary" size="large" loading={updating} disabled={updating} onClick={() => void updateStatus(row.id, 'COMPLETED')}>Был</Button>
                  <Button danger size="large" loading={updating} disabled={updating} onClick={() => void updateStatus(row.id, 'NO_SHOW')}>Не явился</Button>
                </div>
              </Space>
            </Card>
          </List.Item>
        }}
      /> : <Table<DashboardAlert>
          rowKey="id"
          columns={alertColumns}
          dataSource={summary?.alerts ?? []}
          loading={loading && !summary}
          pagination={false}
          scroll={{ x: 850 }}
          locale={{ emptyText: 'Занятий без отметки нет' }}
        />}
    </Card>

    <Card title={<Link to="/horses">Загрузка лошадей на сегодня</Link>} loading={loading && !summary}>
      <Row gutter={[16, 16]}>
        {(summary?.horseWorkloads ?? []).map(horse => <Col key={horse.horseId} xs={24} md={12} xl={8}>
          <Card size="small" title={<Link to={`/horses/edit/${horse.horseId}`}>{horse.horseName}</Link>} extra={<Link to={`/horses/edit/${horse.horseId}`}>Открыть</Link>}>
            <Space direction="vertical" size={4} style={{ width: '100%' }}>
              <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                <Typography.Text type="secondary">Нагрузка</Typography.Text>
                <Typography.Text type="secondary">{horse.usedMinutes} / {horse.maxDailyMinutes} мин</Typography.Text>
              </Space>
              <Progress
                percent={Math.min(100, Math.max(0, horse.loadPercent))}
                strokeColor={workloadColor(horse.loadPercent)}
                status={horse.loadPercent >= 100 ? 'exception' : 'normal'}
                format={() => `${horse.loadPercent}%`}
              />
              <Typography.Text type={horse.remainingMinutes === 0 ? 'danger' : 'secondary'}>
                {horse.remainingMinutes > 0 ? `Осталось ${horse.remainingMinutes} мин` : 'Суточный лимит исчерпан'}
              </Typography.Text>
            </Space>
          </Card>
        </Col>)}
        {summary && summary.horseWorkloads.length === 0 && <Col span={24}>
          <Typography.Text type="secondary">Нет активных лошадей</Typography.Text>
        </Col>}
      </Row>
    </Card>
  </Space>
}
