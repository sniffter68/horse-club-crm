import { useTable } from '@refinedev/antd'
import type { HttpError } from '@refinedev/core'
import { Alert, Button, Empty, Popover, Tag, Typography } from 'antd'
import { Link } from 'react-router-dom'
import { ResponsiveTable } from '../../components/ResponsiveTable'
import { useCatalogPermissions } from '../catalogs/permissions'
import { dateOnly, dateTime } from '../cards/format'
import { useState, type ReactNode } from 'react'

export function MembershipVisibility<T extends { isActive: boolean }>({ memberships, children }: {
  memberships: T[]; children: (visible: T[]) => ReactNode;
}) {
  const [showCompleted, setShowCompleted] = useState(false)
  const completedCount = memberships.filter(membership => !membership.isActive).length
  const visible = showCompleted ? memberships : memberships.filter(membership => membership.isActive)
  return <>
    {completedCount > 0 && <Button size="small" type="link" aria-expanded={showCompleted}
      onClick={() => setShowCompleted(value => !value)}>
      {showCompleted ? 'Скрыть завершённые' : `Показать завершённые (${completedCount})`}
    </Button>}
    {visible.length ? children(visible) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE}
      description={memberships.length ? 'Нет активных абонементов' : 'Абонементов нет'} />}
  </>
}

export type ActiveMembership = {
  id: string; planName: string; remainingUnits: number; totalUnits: number;
  validUntil: string; status: 'ACTIVE' | 'EXPIRING';
}

export function MembershipBalance({ membership, clientId, compact = false }: { membership: ActiveMembership | null; clientId: string; compact?: boolean }) {
  const { canManage } = useCatalogPermissions()
  const [summaryOpen, setSummaryOpen] = useState(false)
  if (compact) return <Popover trigger="click" open={summaryOpen} onOpenChange={setSummaryOpen} title={membership?.planName ?? 'Абонемент'}
    content={<MembershipBalance membership={membership} clientId={clientId} />}>
    <Button type="link" size="small" className="membership-summary-button" aria-expanded={summaryOpen}
      onClick={() => setSummaryOpen(!summaryOpen)} onKeyDown={event => { if (event.key === 'Escape') setSummaryOpen(false) }}>
      {membership ? `${membership.remainingUnits} / ${membership.totalUnits} занятий · до ${dateOnly(membership.validUntil)}` : 'Нет абонемента · выдать'}
    </Button>
  </Popover>
  return <section className="client-membership" aria-label="Активный абонемент">
    {membership ? <>
      <div className="client-membership-summary">
        <Typography.Text className="client-membership-plan" strong title={membership.planName}>{membership.planName}</Typography.Text>
        <Tag className={`crm-tag crm-tag--${membership.status === 'EXPIRING' ? 'warning' : 'success'}`}>
          {membership.status === 'EXPIRING' ? 'Истекает' : 'Активен'}
        </Tag>
      </div>
      <div className="client-membership-details">
        <div className="client-membership-balance">Осталось: <span className="data-mono">{membership.remainingUnits} / {membership.totalUnits}</span> занятий</div>
        <Typography.Text type="secondary">до {dateOnly(membership.validUntil)}</Typography.Text>
      </div>
    </> : <>
      <Typography.Text type="secondary">Нет активного абонемента</Typography.Text>
      {canManage && <Link className="client-membership-issue" to={`/memberships/new?clientId=${encodeURIComponent(clientId)}`}>+ Выдать абонемент</Link>}
    </>}
  </section>
}

type LedgerOperation = {
  id: string; type: 'DEBIT' | 'CREDIT' | 'REFUND'; amount: number; reason: string; createdAt: string;
  transactionType?: 'purchase' | 'usage' | 'penalty_cancellation' | 'refund' | 'boarding_charge' | 'manual_adjustment'; signedAmount?: string; unit?: 'RUB' | 'lessons';
  membership: { title?: string; pricingPlan: { name: string } | null } | null;
  lesson: { id: string; startTime: string; status: string; service: { title: string; name: string } } | null;
}
function operationLabel(row: LedgerOperation) {
  if (row.transactionType === 'purchase' && row.unit === 'RUB') return 'Оплата'
  if (row.transactionType === 'manual_adjustment') return 'Ручная корректировка'
  if (row.transactionType === 'boarding_charge') return 'Начисление постоя'
  if (row.transactionType === 'penalty_cancellation') return /неявка/i.test(row.reason) ? 'Неявка' : 'Штрафная отмена'
  return row.type === 'CREDIT' ? 'Пополнение' : row.type === 'REFUND' ? (row.unit === 'RUB' ? 'Возврат средств' : 'Возврат занятия')
    : /штраф/i.test(row.reason) ? 'Штрафная отмена' : 'Списание за тренировку'
}

export function ClientLedger({ clientId }: { clientId: string }) {
  const { tableProps, tableQuery } = useTable<LedgerOperation, HttpError>({
    resource: `clients/${clientId}/membership-ledger`, syncWithLocation: false,
    pagination: { pageSize: 10 },
    errorNotification: false,
    queryOptions: { retry: false },
  })
  return <div className="client-ledger">
    <Typography.Paragraph type="secondary">Операции по абонементам и постою клиента. Время московское.</Typography.Paragraph>
    <Button style={{ marginBottom: 16 }} loading={tableQuery.isFetching} onClick={() => void tableQuery.refetch()}>
      {tableQuery.error ? 'Повторить' : 'Обновить'}
    </Button>
    {tableQuery.error ? <Alert type="error" showIcon message="Не удалось загрузить историю баланса"
      description={tableQuery.error.message} /> :
      <ResponsiveTable<LedgerOperation> {...tableProps} rowKey="id" size="small" scroll={{ x: 680 }}
        pagination={{ ...tableProps.pagination, showSizeChanger: false, showTotal: total => `Всего операций: ${total}` }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Операций по абонементам пока нет" /> }}
        columns={[
          { key: 'date', title: 'Дата и время', render: (_: unknown, row) => <span className="data-mono">{dateTime(row.createdAt)}</span> },
          { key: 'type', title: 'Тип операции', render: (_: unknown, row) => operationLabel(row) },
          // Prefer signed canonical amounts; retain compatibility with old magnitudes.
          { key: 'amount', title: 'Изменение', render: (_: unknown, row) => <span className="data-mono">{Number(row.signedAmount ?? (row.type === 'DEBIT' ? -row.amount : row.amount)) < 0 ? '−' : '+'}{Math.abs(Number(row.signedAmount ?? row.amount)).toLocaleString('ru-RU')}{row.unit === 'RUB' ? ' ₽' : ''}</span> },
          { key: 'reason', title: 'Комментарий / тренировка', render: (_: unknown, row) => <>
            <div>{row.reason || 'Без комментария'}</div>
            {row.lesson && <div>{dateTime(row.lesson.startTime)} · {row.lesson.service.title || row.lesson.service.name}</div>}
            <Typography.Text type="secondary">{row.membership?.title || row.membership?.pricingPlan?.name || (row.unit === 'RUB' ? 'Рублёвый счёт' : 'Индивидуальный абонемент')}</Typography.Text>
          </> },
        ]} />}
  </div>
}
