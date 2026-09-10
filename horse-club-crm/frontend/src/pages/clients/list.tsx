import { Space, Tag } from 'antd'
import { CatalogList } from '../catalogs/shared'
import type { Client } from '../catalogs/types'

export function ClientList() {
  return <CatalogList<Client> resource="clients" title="Клиенты" columns={[
    { key: 'firstName', dataIndex: 'firstName', title: 'Имя', sorter: true },
    { key: 'lastName', dataIndex: 'lastName', title: 'Фамилия', sorter: true },
    { key: 'phone', dataIndex: 'phone', title: 'Телефон', sorter: true },
    { key: 'roles', title: 'Роли', render: (_: unknown, row) => <Space>{row.isRider && <Tag color="blue">Всадник</Tag>}{row.isPayer && <Tag color="green">Плательщик</Tag>}</Space> },
    { key: 'preferences', dataIndex: 'preferences', title: 'Заметки', width: 260, ellipsis: true },
    { key: 'createdAt', dataIndex: 'createdAt', title: 'Дата создания', sorter: true,
      render: (value: string) => new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeZone: 'Europe/Moscow' }).format(new Date(value)) },
  ]} />
}
