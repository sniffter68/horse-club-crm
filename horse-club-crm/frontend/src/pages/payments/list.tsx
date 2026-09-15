import { useState } from 'react'
import { useUpdate, type HttpError } from '@refinedev/core'
import { List, useTable } from '@refinedev/antd'
import { Alert, Button, Form, Input, Space, Table, Tag } from 'antd'
import dayjs from 'dayjs'
import { money } from '../catalogs/format'
import type { Payment, PaymentStatus } from './types'

const statuses: Record<PaymentStatus, string> = { PENDING: 'Не оплачено', PAID: 'Оплачено', REFUNDED: 'Возвращено', CANCELLED: 'Отменено' }
const colors: Record<PaymentStatus, string> = { PENDING: 'gold', PAID: 'green', REFUNDED: 'blue', CANCELLED: 'default' }
function personName(payment: Payment): string {
  return [payment.client.firstName, payment.client.lastName].filter(Boolean).join(' ') || payment.client.name || '—'
}

export function PaymentList() {
  const [updatingId, setUpdatingId] = useState<string>()
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

  return <List title="Оплаты" canCreate={false}>
    <Alert type="info" showIcon message="Простой внутренний учёт"
      description="Начисления создаются автоматически. Нажмите «Оплачено», когда деньги получены. Кассовые чеки и бухгалтерия ведутся отдельно."
      style={{ marginBottom: 20 }} />
    <Form {...searchFormProps} layout="inline" style={{ marginBottom: 20 }}>
      <Form.Item name="q" style={{ width: 320, maxWidth: '100%' }}>
        <Input.Search placeholder="Клиент, лошадь или комментарий" allowClear
          onSearch={() => searchFormProps.form?.submit()} />
      </Form.Item>
      <Button htmlType="submit">Найти</Button>
    </Form>
    {tableQuery.error && <Alert type="error" showIcon message="Не удалось загрузить оплаты" description={tableQuery.error.message} />}
    <Table<Payment> {...tableProps} rowKey="id" scroll={{ x: 'max-content' }} pagination={{
      ...tableProps.pagination, showSizeChanger: true, pageSizeOptions: [20, 50, 100], showTotal: total => `Всего: ${total}`,
    }} columns={[
    { key: 'client', title: 'Клиент', render: (_: unknown, record) => personName(record) },
    { key: 'source', title: 'Основание', render: (_: unknown, record) => record.boardingContract
      ? `Постой: ${record.boardingContract.horse.name}`
      : record.booking ? `Занятие: ${record.booking.lesson.service.title || record.booking.lesson.service.name}`
        : record.membership ? `Абонемент: ${record.membership.pricingPlan?.name || record.membership.id}` : 'Ручная запись' },
    { key: 'amount', dataIndex: 'amount', title: 'Сумма', sorter: true, render: money },
    { key: 'status', dataIndex: 'status', title: 'Оплата', sorter: true, render: (_: PaymentStatus, record) => <Space>
      <Tag color={colors[record.status]}>{statuses[record.status]}</Tag>
      {record.status === 'PAID'
        ? <Button size="small" loading={updatingId === record.id} onClick={() => setPaid(record, false)}>Снять отметку</Button>
        : <Button type="primary" size="small" loading={updatingId === record.id} onClick={() => setPaid(record, true)}>Оплачено</Button>}
    </Space> },
    { key: 'paidAt', dataIndex: 'paidAt', title: 'Дата оплаты', sorter: true,
      render: (value: string | null) => value ? dayjs(value).format('DD.MM.YYYY HH:mm') : '—' },
  ]} />
  </List>
}
