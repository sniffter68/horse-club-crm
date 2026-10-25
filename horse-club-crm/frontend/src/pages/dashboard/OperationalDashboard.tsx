import { LessonPaymentBadge } from '../schedule/LessonPayments'
import type { LessonMoney } from '../schedule/types'
import { Button, Card, Col, Empty, List, Progress, Row, Space, Statistic, Tag, Typography } from 'antd'
import { usePermissions } from '../../modulePermissions'
import { QuickActions } from './QuickActions'
import { Link } from 'react-router-dom'
import { ArrowRightOutlined } from '@ant-design/icons'
import { currency } from '../cash-desk/shared'
import type { ShiftStatus } from '../staff/types'

export interface OperationalSummary {
  todayLessons?: { total: number; completed: number; cancelled: number }
  cashboxSummary?: { cash: string; card: string; revenueToday: string; expensesToday: string }
  horsesStatus?: { total: number; healthy: number; treatment: number; quarantine: number }
  activeShifts?: number
  onDutyStaff?: Array<{ id: string; staffId: string; fullName: string; roleTitle: string; startTime: string; endTime: string; status: ShiftStatus }>
  pendingVetAlerts?: number
  upcomingLessons?: Array<Omit<LessonMoney, 'bookings'> & { id: string; startTime: string; endTime: string; trainer: { name: string }; service: { name: string; title: string }; bookings: Array<NonNullable<LessonMoney['bookings']>[number] & { client: { name: string }; horse: { name: string } | null }> }>
}

const time = (date: string) => new Date(date).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' })

export function OperationalDashboard({ summary, loading, refresh, complete, updatingIds }: {
  summary?: OperationalSummary; loading: boolean; refresh: () => void; complete: (id: string) => void; updatingIds: Set<string>
}) {
  const modules = usePermissions()
  const lessons = summary?.todayLessons, horses = summary?.horsesStatus
  const cash = modules.canRead('CASHBOX') ? summary?.cashboxSummary : undefined
  return <Space direction="vertical" size="large" style={{ width: '100%' }}>
    <QuickActions onSaved={refresh} shifts={(summary?.onDutyStaff ?? []).map(row => ({ ...row, date: '' }))} />
    <Row gutter={[16, 16]} aria-label="Показатели дня">
      {modules.canRead('SCHEDULE') && <Col xs={24} sm={12} xl={6}><Card className="dashboard-day-card dashboard-day-card--lessons" loading={loading}>
        <Statistic title="Тренировки сегодня" value={lessons?.completed ?? 0} suffix={`/ ${lessons?.total ?? 0}`} />
        <Progress aria-label="Прогресс тренировок" percent={lessons?.total ? Math.round(lessons.completed / lessons.total * 100) : 0} />
        <Typography.Text type="secondary">Отменено: {lessons?.cancelled ?? 0}</Typography.Text>
      </Card></Col>}
      {modules.canRead('CASHBOX') && <Col xs={24} sm={12} xl={6}><Link to="/cash-desk" className="dashboard-cash-link" aria-label="Баланс кассы — открыть кассу"><Card title="Баланс кассы" extra={<ArrowRightOutlined aria-hidden />} className="dashboard-day-card dashboard-day-card--cash" loading={loading}>
        {cash ? <Space direction="vertical" size={4}>
          <span>Наличные в кассе <strong data-testid="dashboard-cash">{currency(cash.cash)}</strong></span>
          <span>На счете <strong>{currency(cash.card)}</strong></span>
          <Typography.Text type="secondary">Выручка сегодня: {currency(cash.revenueToday)}</Typography.Text>
          <Typography.Text type="secondary">Расходы сегодня: {currency(cash.expensesToday)}</Typography.Text>
        </Space> : <Typography.Text type="secondary">Данные кассы недоступны</Typography.Text>}
      </Card></Link></Col>}
      {modules.canRead('STABLES') && <Col xs={24} sm={12} xl={6}><Card className="dashboard-day-card dashboard-day-card--horses" loading={loading}>
        <Statistic title="Поголовье и здоровье" value={horses?.total ?? 0} />
        <Space wrap><Tag color="success">В работе: {horses?.healthy ?? 0}</Tag><Tag color={horses?.treatment ? 'warning' : 'default'}>На лечении: {horses?.treatment ?? 0}</Tag><Tag color={horses?.quarantine ? 'error' : 'default'}>Карантин: {horses?.quarantine ?? 0}</Tag></Space>
        {modules.canRead('VETERINARY') && <div><Typography.Text type={summary?.pendingVetAlerts ? 'warning' : 'secondary'}>Ветпроцедуры требуют внимания: {summary?.pendingVetAlerts ?? 0}</Typography.Text></div>}
      </Card></Col>}
      {modules.canRead('STAFF_PAYROLL') && <Col xs={24} sm={12} xl={6}><Card className="dashboard-day-card dashboard-day-card--staff" loading={loading}>
        <Statistic title="Персонал на смене" value={summary?.activeShifts ?? 0} />
        <div className="dashboard-on-duty">{summary?.onDutyStaff?.length ? summary.onDutyStaff.map(person => <div key={person.id}>
          <strong>{person.fullName}</strong><br /><Typography.Text type="secondary">{person.roleTitle} · {person.startTime}–{person.endTime}</Typography.Text>
        </div>) : <Typography.Text type="secondary">Смен на сегодня нет</Typography.Text>}</div>
      </Card></Col>}
    </Row>
    {modules.canRead('SCHEDULE') && <Card title="Ближайшие тренировки на сегодня" loading={loading}>
      {summary?.upcomingLessons?.length ? <List dataSource={summary.upcomingLessons} renderItem={lesson => <List.Item className="dashboard-timeline-item">
        <span className="dashboard-timeline-time data-mono">{time(lesson.startTime)}<small>{time(lesson.endTime)}</small></span>
        <div className="dashboard-timeline-details"><LessonPaymentBadge lesson={lesson} /><strong>{lesson.service.title || lesson.service.name}</strong><div>{lesson.trainer.name}</div>
          <Typography.Text type="secondary">{lesson.bookings.map(row => `${row.client.name}${row.horse ? ` · ${row.horse.name}` : ''}`).join(', ') || 'Нет участников'}</Typography.Text></div>
        {modules.canWrite('SCHEDULE') && <Button loading={updatingIds.has(lesson.id)} disabled={updatingIds.has(lesson.id)} onClick={() => complete(lesson.id)}>Завершено</Button>}
      </List.Item>} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Предстоящих тренировок сегодня нет" />}
    </Card>}
  </Space>
}
