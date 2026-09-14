import { Tag } from 'antd'
import { CatalogList } from '../catalogs/shared'
import type { Arena } from '../catalogs/types'

export function ArenaList() {
  return <CatalogList<Arena> resource="arenas" title="Манежи" columns={[
    { key: 'name', dataIndex: 'name', title: 'Название', sorter: true },
    { key: 'description', dataIndex: 'description', title: 'Описание', width: 320, ellipsis: true, render: (value: string | null) => value || '—' },
    { key: 'capacity', dataIndex: 'capacity', title: 'Вместимость', sorter: true },
    { key: 'isUnavailable', dataIndex: 'isUnavailable', title: 'Статус', sorter: true,
      render: (value: boolean) => <Tag color={value ? 'red' : 'green'}>{value ? 'Недоступен' : 'Доступен'}</Tag> },
  ]} />
}
