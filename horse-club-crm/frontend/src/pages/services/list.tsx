import { money } from '../catalogs/format'
import { useCatalogPermissions } from '../catalogs/permissions'
import { Tag, type TableColumnsType } from 'antd'
import { CatalogList } from '../catalogs/shared'
import type { Service } from '../catalogs/types'

export function ServiceList() {
  const { canManage } = useCatalogPermissions()
  const columns: TableColumnsType<Service> = [
    { key: 'title', dataIndex: 'title', title: 'Название', sorter: true },
    { key: 'durationMinutes', dataIndex: 'durationMinutes', title: 'Длительность, мин', sorter: true },
    { key: 'maxCapacity', dataIndex: 'maxCapacity', title: 'Вместимость', sorter: true },
    ...(canManage ? [{ key: 'price', dataIndex: 'price', title: 'Цена', sorter: true, render: money }] : []),
    { key: 'cancellationWindowHours', dataIndex: 'cancellationWindowHours', title: 'Бесплатная отмена за, ч', sorter: true },
    { key: 'allowMembership', dataIndex: 'allowMembership', title: 'Оплата абонементом', render: (value: boolean) => <Tag>{value ? 'Да' : 'Нет'}</Tag> },
  ]
  return <CatalogList<Service> resource="services" title="Услуги" columns={columns} />
}
