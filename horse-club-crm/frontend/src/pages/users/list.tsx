import { List, useTable } from '@refinedev/antd'
import { usePermissions, type HttpError } from '@refinedev/core'
import { Button, Form, Input, Table, Tag } from 'antd'
import { Link } from 'react-router-dom'
import type { Role } from '../../authStorage'

type User = { id: string; email: string; role: Role; createdAt: string }
const roleColor: Record<Role, string> = { ADMIN: 'red', MANAGER: 'blue', TRAINER: 'green' }

export function UserList() {
  const { data: role } = usePermissions<Role>({})
  const { tableProps, searchFormProps } = useTable<User, HttpError, { q?: string }>({
    resource: 'users', pagination: { pageSize: 10 }, sorters: { mode: 'server' },
    onSearch: ({ q }) => [{ field: 'q', operator: 'contains', value: q?.trim() ?? '' }],
  })
  return <List title="Пользователи" canCreate={false}
    headerButtons={role === 'ADMIN' ? <Link to="/users/new"><Button type="primary">Создать</Button></Link> : undefined}>
    <Form {...searchFormProps} layout="inline" style={{ marginBottom: 20 }}><Form.Item name="q"><Input.Search placeholder="Поиск по email" allowClear onSearch={() => searchFormProps.form?.submit()} /></Form.Item><Button htmlType="submit">Найти</Button></Form>
    <Table<User> {...tableProps} rowKey="id" columns={[
      { key: 'email', dataIndex: 'email', title: 'Email', sorter: true },
      { key: 'role', dataIndex: 'role', title: 'Роль', sorter: true, render: (value: Role) => <Tag color={roleColor[value]}>{value}</Tag> },
      { key: 'createdAt', dataIndex: 'createdAt', title: 'Дата создания', sorter: true, render: (value: string) => new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) },
      ...(role === 'ADMIN' ? [{ key: 'actions', title: 'Действия', render: () => '—' }] : []),
    ]} />
  </List>
}
