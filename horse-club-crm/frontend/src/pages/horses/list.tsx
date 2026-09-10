import { Tag } from 'antd'
import { CatalogList } from '../catalogs/shared'
import type { Horse } from '../catalogs/types'

export function HorseList() {
  return <CatalogList<Horse> resource="horses" title="Лошади" columns={[
    { key: 'name', dataIndex: 'name', title: 'Кличка', sorter: true },
    { key: 'breed', dataIndex: 'breed', title: 'Порода', sorter: true },
    { key: 'riderLevel', dataIndex: 'riderLevel', title: 'Уровень всадника', sorter: true },
    { key: 'maxDailyMinutes', dataIndex: 'maxDailyMinutes', title: 'Лимит нагрузки, мин/день', sorter: true },
    { key: 'minRestMinutes', dataIndex: 'minRestMinutes', title: 'Минимальный отдых, мин', sorter: true },
    { key: 'isUnavailable', dataIndex: 'isUnavailable', title: 'Статус', sorter: true,
      render: (value: boolean) => <Tag color={value ? 'red' : 'green'}>{value ? 'Недоступна' : 'Доступна'}</Tag> },
  ]} />
}
