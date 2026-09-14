import { Tag } from 'antd'
import { CatalogList } from '../catalogs/shared'
import type { Stall } from '../catalogs/types'

export function StallList() {
  return <CatalogList<Stall> resource="stalls" title="Денники" columns={[
    { key: 'name', dataIndex: 'name', title: 'Название', sorter: true },
    { key: 'description', dataIndex: 'description', title: 'Описание', width: 420, ellipsis: true,
      render: (value: string | null) => value || '—' },
    { key: 'isUnavailable', dataIndex: 'isUnavailable', title: 'Статус', sorter: true,
      render: (value: boolean) => <Tag color={value ? 'red' : 'green'}>{value ? 'Недоступен' : 'Доступен'}</Tag> },
  ]} />
}
