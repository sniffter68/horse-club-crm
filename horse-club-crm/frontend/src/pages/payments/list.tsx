import { LiveSearch } from '../../components/LiveSearch'
import { PeriodClosingButton } from '../cash-desk/PeriodClosingModal'
import { CashDeskPaymentModal } from '../cash-desk/CashDeskPaymentModal'
import { recordSuggestion } from '../../components/searchText'
import { usePermissions } from '../../modulePermissions'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useUpdate, type HttpError } from '@refinedev/core'
import { List, useTable } from '@refinedev/antd'
import { Alert, Button, Descriptions, Form, Space, Tag, Tabs } from 'antd'
import { money } from '../catalogs/format'
import { dateTime, personName } from '../cards/format'
import { CardLink, DetailsModal } from '../cards/shared'
import type { Payment, PaymentStatus } from './types'
import { ResponsiveTable } from '../../components/ResponsiveTable'
import { PaymentEditDrawer } from './PaymentEditDrawer'
import { paymentMethods } from './methods'
import { BoardingCash } from '../cash-desk/BoardingCash'

const statuses: Record<PaymentStatus, string> = { PENDING: 'Не оплачено', PAID: 'Оплачено', REFUNDED: 'Возвращено', CANCELLED: 'Отменено' }
const colors: Record<PaymentStatus, string> = { PENDING: 'gold', PAID: 'green', REFUNDED: 'blue', CANCELLED: 'default' }

function source(payment: Payment): string {
  if (payment.boardingContract) return `Постой: ${payment.boardingContract.horse.name}`
  if (payment.booking) return `Занятие: ${payment.booking.lesson?.service.title || payment.booking.lesson?.service.name || 'Тренировка'}`
  if (payment.membership) return `Абонемент: ${payment.membership.pricingPlan?.name || 'индивидуальный'}`
  return 'Ручная запись'
}

export function PaymentList() {
  const [params, setParams] = useSearchParams()
  const cashboxType = ['MAIN', 'BOARDING'].includes(params.get('cashboxType') ?? '') ? params.get('cashboxType')! : ''
  const { canWrite } = usePermissions()
  const writable = canWrite('CASHBOX')
  const [updatingId, setUpdatingId] = useState<string>()
  const [selectedId, setSelectedId] = useState<string>()
  const [collecting, setCollecting] = useState<Payment>()
  const [editing, setEditing] = useState<Payment>()
  const { mutate: update } = useUpdate()
  const { tableProps, searchFormProps, tableQuery, setCurrentPage } = useTable<Payment, HttpError, { q?: string }>({
    resource: 'payments', pagination: { pageSize: 20 }, sorters: { initial: [{ field: 'createdAt', order: 'desc' }] },
    filters: { permanent: [{ field: 'cashboxType', operator: 'eq', value: cashboxType || undefined }] },
    onSearch: ({ q }) => [{ field: 'q', operator: 'contains', value: q?.trim() ?? '' }],
  })
  useEffect(() => { setCurrentPage(1) }, [cashboxType, setCurrentPage])
  const setPaid = (payment: Payment, paid: boolean) => {
    if (paid && (payment.bookingId || payment.membershipId)) { setCollecting(payment); return }
    setUpdatingId(payment.id)
    update({
      resource: 'payments', id: payment.id,
      values: { status: paid ? 'PAID' : 'PENDING', paidAt: paid ? new Date().toISOString() : null },
      successNotification: { message: paid ? 'Оплата отмечена' : 'Отметка оплаты снята', type: 'success' },
    }, { onSuccess: () => window.dispatchEvent(new Event('cash-desk-paid')), onSettled: () => setUpdatingId(undefined) })
  }

  return <>
    {!writable && <Alert type="info" showIcon message="Доступно только для просмотра" />}
    <List title="Платежи" canCreate={false}>
      <PeriodClosingButton />
      <Tabs activeKey={cashboxType} onChange={value => setParams(previous => { const next = new URLSearchParams(previous); if (value) next.set('cashboxType', value); else next.delete('cashboxType'); return next })}
        items={[{ key: '', label: 'Все' }, { key: 'MAIN', label: 'Основная касса' }, { key: 'BOARDING', label: 'Касса постоя' }]} />
      {cashboxType === 'BOARDING' && <BoardingCash />}
      <Alert type="info" showIcon message="Простой внутренний учёт"
        description="Начисления создаются автоматически. Нажмите «Оплачено», когда деньги получены. Кассовые чеки и бухгалтерия ведутся отдельно."
        style={{ marginBottom: 12 }} />
      <Form noValidate {...searchFormProps} layout="inline" className="crm-list-toolbar">
        <Form.Item name="q" style={{ width: 320, maxWidth: '100%' }}><LiveSearch loading={tableQuery.isFetching} suggestions={(tableProps.dataSource ?? []).flatMap(row => { const item = recordSuggestion(row); return item ? [item] : [] })} placeholder="Клиент, лошадь или комментарий" onSearch={() => searchFormProps.form?.submit()} /></Form.Item>
        <Button htmlType="submit">Найти</Button>
      </Form>
      {tableQuery.error && <Alert type="error" showIcon message="Не удалось загрузить оплаты" description={tableQuery.error.message} />}
      <ResponsiveTable<Payment> {...tableProps} compact className="crm-entity-table" tableLayout="fixed" size="small" rowKey="id" pagination={{
        ...tableProps.pagination, showSizeChanger: true, pageSizeOptions: [20, 50, 100], showTotal: total => `Всего: ${total}`,
      }} columns={[
        { key: 'client', title: 'Клиент', render: (_: unknown, record) => <CardLink onClick={() => setSelectedId(record.id)}>{personName(record.client)}</CardLink> },
        { key: 'source', title: 'Основание', render: (_: unknown, record) => source(record) },
        { key: 'amount', dataIndex: 'amount', title: 'Сумма', align: 'right', sorter: true, render: money },
        { key: 'method', title: 'Способ оплаты', render: (_: unknown, row) => <Tag color={row.method === 'CASH' ? 'green' : 'blue'}>{paymentMethods.find(item => item.value === row.method)?.label || 'Не указан'}</Tag> },
        { key: 'status', dataIndex: 'status', title: 'Оплата', sorter: true, render: (_: PaymentStatus, record) => <Space>
          <Tag color={colors[record.status]}>{statuses[record.status]}</Tag>
          {record.status === 'PENDING' && <Button disabled={!writable} type="primary" size="small" loading={updatingId === record.id} onClick={() => setPaid(record, true)}>Оплачено</Button>}
        </Space> },
        { key: 'paidAt', dataIndex: 'paidAt', title: 'Дата оплаты', sorter: true, render: dateTime },
        { key: 'edit', title: 'Действия', render: (_: unknown, row) => writable && row.status === 'PAID' && <Button size="small" onClick={() => setEditing(row)}>Изменить</Button> },
      ]} />
    </List>
    {collecting && <CashDeskPaymentModal variant="drawer" initialClientId={collecting.clientId} initialBookingId={collecting.bookingId || undefined} initialMembershipId={collecting.membershipId || undefined}
      onClose={() => setCollecting(undefined)} onPaid={() => { void tableQuery.refetch() }} />}
    {editing && <PaymentEditDrawer payment={editing} onClose={() => setEditing(undefined)} onSaved={() => { setEditing(undefined); void tableQuery.refetch() }} />}
    <DetailsModal<Payment> resource="payments" id={selectedId} title="Карточка начисления" onClose={() => setSelectedId(undefined)}>
      {payment => <Descriptions bordered size="small" column={{ xs: 1, sm: 2 }} items={[
        { key: 'client', label: 'Клиент', children: personName(payment.client) },
        { key: 'source', label: 'Основание', children: source(payment) },
        { key: 'amount', label: 'Сумма', children: money(payment.amount) },
        { key: 'status', label: 'Статус', children: <Tag color={colors[payment.status]}>{statuses[payment.status]}</Tag> },
        { key: 'createdAt', label: 'Начислено', children: dateTime(payment.createdAt) },
        { key: 'paidAt', label: 'Оплачено', children: dateTime(payment.paidAt) },
        { key: 'description', label: 'Комментарий', span: 2, children: payment.description || '—' },
      ]} />}
    </DetailsModal>
  </>
}
