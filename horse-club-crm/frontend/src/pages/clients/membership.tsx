import { useTable } from '@refinedev/antd'
import type { HttpError } from '@refinedev/core'
import { Alert, Button, Empty, Space, Tag, Typography } from 'antd'
import { Link } from 'react-router-dom'
import { ResponsiveTable } from '../../components/ResponsiveTable'
import { useCatalogPermissions } from '../catalogs/permissions'
import { dateOnly, dateTime } from '../cards/format'

export type ActiveMembership = {
  id: string; planName: string; remainingUnits: number; totalUnits: number;
  validUntil: string; status: 'ACTIVE' | 'EXPIRING';
}

export function MembershipBalance({ membership, clientId }: { membership: ActiveMembership | null; clientId: string }) {
  const { canManage } = useCatalogPermissions()
  return <section className="client-membership" aria-label="Активный абонемент">
    {membership ? <>
      <Space wrap>
        <Typography.Text strong>{membership.planName}</Typography.Text>
        <Tag className={`crm-tag crm-tag--${membership.status === 'EXPIRING' ? 'warning' : 'success'}`}>
          {membership.status === 'EXPIRING' ? 'Истекает' : 'Активен'}
        </Tag>
      </Space>
      <div className="client-membership-balance">Осталось: <span className="data-mono">{membership.remainingUnits} / {membership.totalUnits}</span> занятий</div>
      <Typography.Text type="secondary">до {dateOnly(membership.validUntil)}</Typography.Text>
    </> : <>
      <Typography.Text type="secondary">Нет активного абонемента</Typography.Text>
      {canManage && <Link className="client-membership-issue" to={`/memberships/new?clientId=${encodeURIComponent(clientId)}`}>+ Выдать абонемент</Link>}
    </>}
  </section>
}

type LedgerOperation = {
  id: string; type: 'DEBIT' | 'CREDIT' | 'REFUND'; amount: number; reason: string; createdAt: string;
  membership: { pricingPlan: { name: string } | null };
  lesson: { id: string; startTime: string; status: string; service: { title: string; name: string } } | null;
}

export function ClientLedger({ clientId }: { clientId: string }) {
  const { tableProps, tableQuery } = useTable<LedgerOperation, HttpError>({
    resource: `clients/${clientId}/membership-ledger`, syncWithLocation: false,
    pagination: { pageSize: 10 },
    errorNotification: false,
    queryOptions: { retry: false },
  })
  return <div className="client-ledger">
    <Typography.Paragraph type="secondary">Операции по всем абонементам клиента. Время московское.</Typography.Paragraph>
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
          { key: 'type', title: 'Тип операции', render: (_: unknown, row) => row.type === 'CREDIT' ? 'Пополнение'
            : row.type === 'REFUND' ? 'Возврат занятия' : /штраф/i.test(row.reason) ? 'Штрафная отмена' : 'Списание за тренировку' },
          // Ledger stores positive magnitudes for DEBIT as well as CREDIT/REFUND.
          { key: 'amount', title: 'Изменение', render: (_: unknown, row) => <span className="data-mono">{row.type === 'DEBIT' ? '−' : '+'}{Math.abs(row.amount)}</span> },
          { key: 'reason', title: 'Комментарий / тренировка', render: (_: unknown, row) => <>
            <div>{row.reason || 'Без комментария'}</div>
            {row.lesson && <div>{dateTime(row.lesson.startTime)} · {row.lesson.service.title || row.lesson.service.name}</div>}
            <Typography.Text type="secondary">{row.membership.pricingPlan?.name || 'Индивидуальный абонемент'}</Typography.Text>
          </> },
        ]} />}
  </div>
}
