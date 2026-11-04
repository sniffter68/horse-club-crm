import { Tag } from 'antd'
import { CatalogList } from '../catalogs/shared'
import type { Arena } from '../catalogs/types'

export function ArenaList() {
  return <CatalogList<Arena> resource="arenas" storageKey="horse_crm_arenas_columns_v1" title="Манежи" columns={[
    { key: 'name', fixed: 'left', width: 180, dataIndex: 'name', title: 'Название', sorter: true },
    { key: 'description', dataIndex: 'description', title: 'Описание', width: 240, ellipsis: true, render: (value: string | null) => value || '—' },
    { key: 'capacity', align: 'right', width: 110, dataIndex: 'capacity', title: 'Вместимость', sorter: true },
    { key: 'isUnavailable', align: 'center', width: 130, dataIndex: 'isUnavailable', title: 'Статус', sorter: true,
      render: (value: boolean) => <Tag color={value ? 'red' : 'green'}>{value ? 'Недоступен' : 'Доступен'}</Tag> },
  ]} />
}
