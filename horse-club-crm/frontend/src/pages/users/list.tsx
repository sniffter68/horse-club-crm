import { LiveSearch } from '../../components/LiveSearch'
import { recordSuggestion } from '../../components/searchText'
import { List, useTable } from '@refinedev/antd'
import { usePermissions, type HttpError } from '@refinedev/core'
import { Button, Form, Tag } from 'antd'
import { Link } from 'react-router-dom'
import type { Role } from '../../authStorage'
import { ConfigurableTable } from '../../components/ConfigurableTable'
import { VkAdminRecipient } from '../../components/VkProfileLink'

type User = { id: string; email: string; role: Role; createdAt: string; vkId?: string | null; vkUserId?: string | null }
const roleColor: Record<Role, string> = { ADMIN: 'red', MANAGER: 'blue', TRAINER: 'green', GROOM: 'orange', VET: 'purple', OTHER: 'default', STABLE_WORKER: 'orange' }

export function UserList() {
  const { data: role } = usePermissions<Role>({})
  const { tableProps, searchFormProps, tableQuery } = useTable<User, HttpError, { q?: string }>({
    resource: 'users', pagination: { pageSize: 10 }, sorters: { mode: 'server' },
    onSearch: ({ q }) => [{ field: 'q', operator: 'contains', value: q?.trim() ?? '' }],
  })
  return <List title="Пользователи" canCreate={false}
    headerButtons={role === 'ADMIN' ? <Link to="/users/new"><Button type="primary">Создать</Button></Link> : undefined}>
    <Form noValidate {...searchFormProps} layout="inline" style={{ marginBottom: 20 }}><Form.Item name="q"><LiveSearch loading={tableQuery.isFetching} suggestions={(tableProps.dataSource ?? []).flatMap(row => { const item = recordSuggestion(row); return item ? [item] : [] })} placeholder="Поиск по email" onSearch={() => searchFormProps.form?.submit()} /></Form.Item><Button htmlType="submit">Найти</Button></Form>
    <ConfigurableTable<User> storageKey="horse_crm_users_columns_v1" {...tableProps} rowKey="id" columns={[
      { key: 'email', fixed: 'left', width: 230, dataIndex: 'email', title: 'Email', sorter: true },
      { key: 'role', align: 'center', width: 130, dataIndex: 'role', title: 'Роль', sorter: true, render: (value: Role) => <Tag color={roleColor[value]}>{value}</Tag> },
      { key: 'createdAt', width: 160, dataIndex: 'createdAt', title: 'Дата создания', sorter: true, render: (value: string) => new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) },
      ...(role === 'ADMIN' ? [{ key: 'actions', fixed: 'right' as const, width: 230, title: 'Действия', render: (_: unknown, row: User) => <VkAdminRecipient id={row.id} name={row.email} vkId={row.vkId} vkUserId={row.vkUserId} /> }] : []),
    ]} />
  </List>
}
