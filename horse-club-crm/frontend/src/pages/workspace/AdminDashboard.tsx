import { useState } from 'react'
import { Alert, Button, Card, Empty, List, Progress, Segmented, Space, Spin, Statistic, Tag, Typography } from 'antd'
import { DateTime } from 'luxon'
import { Activity, ChevronDown } from 'lucide-react'
import { PendingLeads } from '../dashboard/PendingLeads'
import { Link, useSearchParams } from 'react-router-dom'
import { usePermissions } from '../../modulePermissions'
import { QuickBookingModal } from '../../components/QuickBookingModal'
import { useWorkspace } from './useWorkspace'
import type { AdminSummary } from './types'
import './workspace.css'
import { ClubIcon } from '../../components/ClubIcon'
import { EquestrianMotif } from '../../components/EquestrianMotif'
import { lessonAccent } from '../../components/lessonAccent'
import { ShiftConditions } from './ShiftConditions'

const rub = (value: number | string) => Number(value).toLocaleString('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 2 })
const localTime = (value: string) => DateTime.fromISO(value, { zone: 'Europe/Moscow' }).toFormat('dd.MM HH:mm')
const actionNames: Record<string, string> = { LESSON_CREATED: 'Создано занятие', LESSON_RESCHEDULED: 'Перенесено занятие', LESSON_COMPLETED: 'Занятие проведено', LESSON_NO_SHOW: 'Отмечена неявка', LESSON_CANCELLED: 'Отменено занятие', SERVICE_CANCELLED: 'Отменена услуга', PAYMENT_RECEIVED: 'Принята оплата', LESSON_ONE_OFF_PAYMENT: 'Принята оплата занятия' }
const statusNames = { SCHEDULED: 'Запланировано', COMPLETED: 'Проведено', NO_SHOW: 'Неявка', CANCELLED: 'Отменено' }

export function AdminDashboardPage() {
  const { data, error, loading, refresh } = useWorkspace<AdminSummary>('admin-summary')
  const [params, setParams] = useSearchParams()
  const period = params.get('period') === 'week' ? 'Неделя' : 'Сегодня'
  const trainer = params.get('trainer') || undefined
  const arena = params.get('arena') || undefined
  const filter = (key: string, value?: string) => setParams(current => { const next = new URLSearchParams(current); if (value) next.set(key, value); else next.delete(key); return next })
  const setPeriod = (value: string) => filter('period', value === 'Неделя' ? 'week' : undefined)
  const setTrainer = (value?: string) => filter('trainer', value)
  const setArena = (value?: string) => filter('arena', value)
  const [booking, setBooking] = useState(false)
  const [actionsExpanded, setActionsExpanded] = useState(false)
  const permissions = usePermissions()
  if (loading) return <div className="workspace-loading"><Spin aria-label="Загрузка сводки" /></div>
  if (error || !data) return <Alert type="error" showIcon message={error || 'Сводка недоступна'} action={<Button onClick={refresh}>Повторить</Button>} />
  const trainers = [...new Map(data.week.map(row => [row.trainer.id, row.trainer])).values()]
  const arenas = [...new Map(data.week.flatMap(row => row.arena ? [[row.arena.id, row.arena] as const] : [])).values()]
  const lessons = (period === 'Сегодня' ? data.today : data.week).filter(row => (!trainer || row.trainer.id === trainer) && (!arena || row.arena?.id === arena))
  const finance = data.finance
  const latestAction = data.actions.reduce<AdminSummary['actions'][number] | undefined>((latest, row) => !latest || Date.parse(row.createdAt) > Date.parse(latest.createdAt) ? row : latest, undefined)
  const percent = finance && Number(finance.accrued) > 0 ? Math.min(100, Math.round(Number(finance.paid) / Number(finance.accrued) * 100)) : 0
  return <section className="admin-workspace gap-6" aria-label="Рабочее место администратора">
    <header className="workspace-toolbar shift-welcome"><EquestrianMotif /><div><Typography.Title level={2}>Хорошей смены!</Typography.Title><ShiftConditions /></div><Button onClick={refresh}>Обновить сводку</Button></header>
    <div className="workspace-kpis">{([
      ['Занятий сегодня', data.kpi.lessonsToday, '/schedule', 'Открыть расписание'],
      ['Активных всадников', data.kpi.activeRiders, '/clients', 'Открыть клиентов'],
      ['Ожидают подтверждения', data.kpi.awaitingConfirmation, '/schedule', 'Проверить записи'],
      ['Новые заявки', data.kpi.newLeads, '/leads', 'Открыть заявки'],
    ] as const).map(([title, value, to, hint], index) => <Link key={title} to={to} className="crm-card-link workspace-kpi-link" aria-label={`${title} — ${hint}`}>
      <Card><Statistic className="tabular-nums" title={<span className="club-icon-label"><ClubIcon name={index === 0 ? 'calendar' : index === 1 ? 'users' : 'bell'} />{title}</span>} value={value} /><span className="workspace-kpi-hint">{hint}</span></Card>
    </Link>)}</div>
    <div className={`admin-workspace-columns${finance ? '' : ' admin-workspace-columns-single'}`}><Card className="workspace-main-card workspace-schedule-card" title={<span className="club-icon-label"><ClubIcon name="calendar" />Сегодня и неделя</span>} extra={permissions.canWrite('SCHEDULE') && <Button type="primary" onClick={() => setBooking(true)}>+ Создать запись</Button>}>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Segmented options={['Сегодня', 'Неделя']} value={period} onChange={setPeriod} />
        <Space wrap aria-label="Фильтр по тренерам"><Button aria-pressed={!trainer} type={!trainer ? 'primary' : 'default'} onClick={() => setTrainer(undefined)}>Все тренеры</Button>{trainers.map(row => <Button key={row.id} aria-pressed={trainer === row.id} onClick={() => setTrainer(trainer === row.id ? undefined : row.id)}>{row.name}</Button>)}</Space>
        <Space wrap aria-label="Фильтр по площадкам"><Button aria-pressed={!arena} onClick={() => setArena(undefined)}>Все площадки</Button>{arenas.map(row => <Button key={row.id} aria-pressed={arena === row.id} onClick={() => setArena(arena === row.id ? undefined : row.id)}>{row.name}</Button>)}</Space>
      </Space>
      {!lessons.length && <Empty description="Нет занятий с выбранными фильтрами" />}
      {lessons.map(lesson => <article className="workspace-lesson" key={lesson.id} style={lessonAccent(lesson.trainer.id)}>
        <time dateTime={lesson.startTime}>{localTime(lesson.startTime)}–{DateTime.fromISO(lesson.endTime, { zone: 'Europe/Moscow' }).toFormat('HH:mm')}</time>
        <div><strong>{lesson.bookings.map(row => row.client?.name).filter(Boolean).join(', ') || 'Всадник не назначен'}</strong><div>{lesson.trainer.name} · {lesson.bookings.map(row => row.horse?.name).filter(Boolean).join(', ') || 'Без лошади'} · {lesson.arena?.name || 'Без площадки'}</div></div>
        <Tag color={lesson.status === 'COMPLETED' ? 'success' : 'default'}>{statusNames[lesson.status]}</Tag>
        <Tag color={lesson.bookings.length && lesson.bookings.every(row => row.clientConfirmed) ? 'success' : 'warning'}>{lesson.bookings.length && lesson.bookings.every(row => row.clientConfirmed) ? 'Подтверждено' : 'Ждём подтверждения'}</Tag>
      </article>)}
      <Typography.Title level={5}>Без подтверждения в ближайшие 24 часа</Typography.Title>
      {data.unconfirmed.length ? data.unconfirmed.map(row => <p key={row.id}>{localTime(row.startTime)} · {row.trainer.name} · {row.bookings.filter(b => !b.clientConfirmed).map(b => b.client?.name).join(', ')}</p>) : <Typography.Text type="secondary">Все ближайшие занятия подтверждены</Typography.Text>}
    </Card>
      {finance && <Card className="workspace-main-card workspace-finance-card" title={<span className="club-icon-label"><ClubIcon name="wallet" />Финансы за месяц</span>}><Typography.Text>Собрано оплат</Typography.Text><Progress className="monthly-payment-progress" percent={percent} />
        <dl className="workspace-finance">{([
          ['Начислено', finance.accrued], ['Оплачено', finance.paid], ['Задолженность', finance.debt], ['Основная касса', finance.mainBalance], ['Касса постоя', finance.boardingBalance], ['Признанная выручка по абонементам', finance.recognizedMembershipRevenue],
        ] as const).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{rub(value)}</dd></div>)}</dl>
      </Card>}
    </div>
    <Card className="workspace-actions-card">
      <h3 className="workspace-actions-heading"><button type="button" id="shift-actions-toggle" className="workspace-actions-toggle" aria-expanded={actionsExpanded} aria-controls="shift-actions-list" onClick={() => setActionsExpanded(expanded => !expanded)}>
        <span className="workspace-actions-summary"><span className="club-icon-label"><Activity size={18} strokeWidth={1.75} aria-hidden="true" />Журнал действий смены<Tag className="tabular-nums">{data.actions.length}</Tag></span>
          {latestAction && <span className="workspace-actions-preview">{actionNames[latestAction.action] || latestAction.action} · {localTime(latestAction.createdAt)} · {latestAction.actorName}</span>}
        </span>
        <span className="workspace-actions-indicator">{actionsExpanded ? 'Свернуть' : 'Развернуть'}<ChevronDown size={18} strokeWidth={1.75} aria-hidden="true" style={{ transform: actionsExpanded ? 'rotate(180deg)' : undefined }} /></span>
      </button></h3>
      <div id="shift-actions-list" role="region" aria-labelledby="shift-actions-toggle" hidden={!actionsExpanded} className="workspace-actions-list max-h-80 overflow-y-auto" tabIndex={0}>
        <List dataSource={data.actions} locale={{ emptyText: 'Действий пока нет' }} renderItem={row => <List.Item><div><strong>{actionNames[row.action] || row.action}</strong><div className="tabular-nums">{localTime(row.createdAt)} · {row.actorName}</div></div></List.Item>} />
      </div>
    </Card>
    <PendingLeads leads={data.leadRequests} loading={loading} onProcessed={refresh} />
    {booking && <QuickBookingModal onClose={() => setBooking(false)} onSaved={() => { setBooking(false); refresh() }} />}
  </section>
}
