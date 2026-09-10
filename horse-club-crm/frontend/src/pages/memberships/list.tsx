import { CreateButton, List, useTable } from '@refinedev/antd'
import type { HttpError } from '@refinedev/core'
import { Form, Input, Table, Tag } from 'antd'

type Membership = { id: string; totalLessons: number; remainedLessons: number; validUntil: string; isActive: boolean; client: { name: string; firstName: string; lastName: string } | null }
export function MembershipList() {
  const { tableProps, searchFormProps } = useTable<Membership, HttpError, { q?: string }>({ resource: 'memberships', pagination: { pageSize: 10 }, onSearch: ({ q }) => [{ field: 'q', operator: 'contains', value: q?.trim() ?? '' }] })
  return <List title="Абонементы" headerButtons={<CreateButton>Продать абонемент</CreateButton>}>
    <Form {...searchFormProps} layout="inline" style={{ marginBottom: 20 }}><Form.Item name="q"><Input.Search placeholder="Поиск клиента" allowClear onSearch={() => searchFormProps.form?.submit()} /></Form.Item></Form>
    <Table<Membership> {...tableProps} rowKey="id" columns={[
      { key: 'client', title: 'Клиент', render: (_: unknown, record) => record.client ? [record.client.firstName, record.client.lastName].filter(Boolean).join(' ') || record.client.name : '—' },
      { key: 'lessons', title: 'Остаток занятий', render: (_: unknown, record) => `${record.remainedLessons} / ${record.totalLessons}` },
      { key: 'validUntil', dataIndex: 'validUntil', title: 'Действует до', render: (value: string) => new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short' }).format(new Date(value)) },
      { key: 'isActive', dataIndex: 'isActive', title: 'Статус', render: (active: boolean) => <Tag color={active ? 'green' : 'default'}>{active ? 'Активен' : 'Неактивен'}</Tag> },
    ]} />
  </List>
}
