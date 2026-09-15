import { useState } from 'react'
import { CreateButton, List as RefineList, useTable } from '@refinedev/antd'
import type { HttpError } from '@refinedev/core'
import { Descriptions, Empty, Form, Input, List, Progress, Space, Tag, Typography } from 'antd'
import { money } from '../catalogs/format'
import type { RelationLesson, RelationPayment } from '../catalogs/types'
import { dateOnly, dateTime, personName } from '../cards/format'
import { CardLink, DetailsModal } from '../cards/shared'
import { ResponsiveTable } from '../../components/ResponsiveTable'

type Membership = {
  id: string; totalLessons: number; remainedLessons: number; validUntil: string; isActive: boolean;
  client: { id: string; name: string; firstName: string; lastName: string } | null;
  pricingPlan: { id: string; name: string; price: string | number } | null;
}
type MembershipDetails = Membership & {
  payments: RelationPayment[];
  bookings: Array<{ id: string; attended: boolean; attendanceStatus: string; horse: { id: string; name: string } | null; lesson: RelationLesson }>;
  operations: Array<{ id: string; type: string; amount: number; reason: string; createdAt: string; lesson: RelationLesson | null }>;
}

export function MembershipList() {
  const [selectedId, setSelectedId] = useState<string>()
  const { tableProps, searchFormProps } = useTable<Membership, HttpError, { q?: string }>({
    resource: 'memberships', pagination: { pageSize: 10 },
    onSearch: ({ q }) => [{ field: 'q', operator: 'contains', value: q?.trim() ?? '' }],
  })

  return <>
    <RefineList title="Абонементы" headerButtons={<CreateButton>Продать абонемент</CreateButton>}>
      <Form {...searchFormProps} layout="inline" style={{ marginBottom: 20 }}><Form.Item name="q">
        <Input.Search placeholder="Поиск клиента" allowClear onSearch={() => searchFormProps.form?.submit()} />
      </Form.Item></Form>
      <ResponsiveTable<Membership> {...tableProps} rowKey="id" columns={[
        { key: 'client', title: 'Клиент', render: (_: unknown, record) => <CardLink onClick={() => setSelectedId(record.id)}>{record.client ? personName(record.client) : '—'}</CardLink> },
        { key: 'plan', title: 'Тариф', render: (_: unknown, record) => record.pricingPlan?.name || 'Индивидуальный' },
        { key: 'lessons', title: 'Остаток занятий', render: (_: unknown, record) => `${record.remainedLessons} / ${record.totalLessons}` },
        { key: 'validUntil', dataIndex: 'validUntil', title: 'Действует до', render: dateOnly },
        { key: 'isActive', dataIndex: 'isActive', title: 'Статус', render: (active: boolean) => <Tag color={active ? 'green' : 'default'}>{active ? 'Активен' : 'Неактивен'}</Tag> },
      ]} />
    </RefineList>
    <DetailsModal<MembershipDetails> resource="memberships" id={selectedId} title="Карточка абонемента" onClose={() => setSelectedId(undefined)}>
      {membership => <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Descriptions bordered size="small" column={{ xs: 1, sm: 2 }} items={[
          { key: 'client', label: 'Клиент', children: membership.client ? personName(membership.client) : '—' },
          { key: 'plan', label: 'Тариф', children: membership.pricingPlan?.name || 'Индивидуальный' },
          { key: 'validUntil', label: 'Действует до', children: dateOnly(membership.validUntil) },
          { key: 'status', label: 'Статус', children: <Tag color={membership.isActive ? 'green' : 'default'}>{membership.isActive ? 'Активен' : 'Неактивен'}</Tag> },
        ]} />
        <Progress percent={membership.totalLessons ? Math.round(membership.remainedLessons / membership.totalLessons * 100) : 0}
          format={() => `${membership.remainedLessons} / ${membership.totalLessons} занятий`} />
        <section><Typography.Title level={5}>Оплата</Typography.Title>
          {membership.payments.length ? <List dataSource={membership.payments} renderItem={payment => <List.Item>
            <Space><Tag color={payment.status === 'PAID' ? 'green' : 'gold'}>{payment.status}</Tag><strong>{money(payment.amount)}</strong>
              <span>{dateTime(payment.paidAt || payment.createdAt)}</span></Space>
          </List.Item>} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Начисления нет" />}
        </section>
        <section><Typography.Title level={5}>Занятия и списания</Typography.Title>
          {membership.operations.length ? <List dataSource={membership.operations} renderItem={operation => <List.Item>
            <Space wrap><Tag color={operation.type === 'DEBIT' ? 'orange' : 'blue'}>{operation.type}</Tag>
              <strong>{operation.amount > 0 ? '+' : ''}{operation.amount}</strong>
              <span>{operation.lesson ? `${dateTime(operation.lesson.startTime)} · ${operation.lesson.service.title || operation.lesson.service.name}` : operation.reason}</span></Space>
          </List.Item>} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Операций нет" />}
        </section>
      </Space>}
    </DetailsModal>
  </>
}
