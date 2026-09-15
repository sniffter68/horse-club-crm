import { useState } from 'react'
import { useUpdate, type HttpError } from '@refinedev/core'
import { List, useTable } from '@refinedev/antd'
import { Alert, Button, Descriptions, Form, Input, Space, Table, Tag } from 'antd'
import { money } from '../catalogs/format'
import { dateTime, personName } from '../cards/format'
import { CardLink, DetailsModal } from '../cards/shared'
import type { Payment, PaymentStatus } from './types'

const statuses: Record<PaymentStatus, string> = { PENDING: 'Не оплачено', PAID: 'Оплачено', REFUNDED: 'Возвращено', CANCELLED: 'Отменено' }
const colors: Record<PaymentStatus, string> = { PENDING: 'gold', PAID: 'green', REFUNDED: 'blue', CANCELLED: 'default' }

function source(payment: Payment): string {
  if (payment.boardingContract) return `Постой: ${payment.boardingContract.horse.name}`
  if (payment.booking) return `Занятие: ${payment.booking.lesson.service.title || payment.booking.lesson.service.name}`
  if (payment.membership) return `Абонемент: ${payment.membership.pricingPlan?.name || 'индивидуальный'}`
  return 'Ручная запись'
}

export function PaymentList() {
  const [updatingId, setUpdatingId] = useState<string>()
  const [selectedId, setSelectedId] = useState<string>()
  const { mutate: update } = useUpdate()
  const { tableProps, searchFormProps, tableQuery } = useTable<Payment, HttpError, { q?: string }>({
    resource: 'payments', pagination: { pageSize: 20 }, sorters: { initial: [{ field: 'createdAt', order: 'desc' }] },
    onSearch: ({ q }) => [{ field: 'q', operator: 'contains', value: q?.trim() ?? '' }],
  })
  const setPaid = (payment: Payment, paid: boolean) => {
    setUpdatingId(payment.id)
    update({
      resource: 'payments', id: payment.id,
      values: { status: paid ? 'PAID' : 'PENDING', paidAt: paid ? new Date().toISOString() : null },
      successNotification: { message: paid ? 'Оплата отмечена' : 'Отметка оплаты снята', type: 'success' },
    }, { onSettled: () => setUpdatingId(undefined) })
  }

  return <>
    <List title="Платежи" canCreate={false}>
      <Alert type="info" showIcon message="Простой внутренний учёт"
        description="Начисления создаются автоматически. Нажмите «Оплачено», когда деньги получены. Кассовые чеки и бухгалтерия ведутся отдельно."
        style={{ marginBottom: 20 }} />
      <Form {...searchFormProps} layout="inline" style={{ marginBottom: 20 }}>
        <Form.Item name="q" style={{ width: 320, maxWidth: '100%' }}><Input.Search placeholder="Клиент, лошадь или комментарий" allowClear onSearch={() => searchFormProps.form?.submit()} /></Form.Item>
        <Button htmlType="submit">Найти</Button>
      </Form>
      {tableQuery.error && <Alert type="error" showIcon message="Не удалось загрузить оплаты" description={tableQuery.error.message} />}
      <Table<Payment> {...tableProps} rowKey="id" scroll={{ x: 'max-content' }} pagination={{
        ...tableProps.pagination, showSizeChanger: true, pageSizeOptions: [20, 50, 100], showTotal: total => `Всего: ${total}`,
      }} columns={[
        { key: 'client', title: 'Клиент', render: (_: unknown, record) => <CardLink onClick={() => setSelectedId(record.id)}>{personName(record.client)}</CardLink> },
        { key: 'source', title: 'Основание', render: (_: unknown, record) => source(record) },
        { key: 'amount', dataIndex: 'amount', title: 'Сумма', sorter: true, render: money },
        { key: 'status', dataIndex: 'status', title: 'Оплата', sorter: true, render: (_: PaymentStatus, record) => <Space>
          <Tag color={colors[record.status]}>{statuses[record.status]}</Tag>
          {record.status === 'PAID'
            ? <Button size="small" loading={updatingId === record.id} onClick={() => setPaid(record, false)}>Снять отметку</Button>
            : <Button type="primary" size="small" loading={updatingId === record.id} onClick={() => setPaid(record, true)}>Оплачено</Button>}
        </Space> },
        { key: 'paidAt', dataIndex: 'paidAt', title: 'Дата оплаты', sorter: true, render: dateTime },
      ]} />
    </List>
    <DetailsModal<Payment> resource="payments" id={selectedId} title="Карточка начисления" onClose={() => setSelectedId(undefined)}>
      {payment => <Descriptions bordered size="small" column={2} items={[
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
