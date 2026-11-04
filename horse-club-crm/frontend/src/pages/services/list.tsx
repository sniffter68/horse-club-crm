import { money } from '../catalogs/format'
import { useCatalogPermissions } from '../catalogs/permissions'
import { Tag, type TableColumnsType } from 'antd'
import { CatalogList } from '../catalogs/shared'
import type { Service } from '../catalogs/types'

export function ServiceList() {
  const { canManage } = useCatalogPermissions()
  const columns: TableColumnsType<Service> = [
    { key: 'title', fixed: 'left', width: 180, dataIndex: 'title', title: 'Название', sorter: true },
    { key: 'durationMinutes', align: 'right' as const, width: 115, dataIndex: 'durationMinutes', title: 'Длительность, мин', sorter: true },
    { key: 'maxCapacity', align: 'right' as const, width: 110, dataIndex: 'maxCapacity', title: 'Вместимость', sorter: true },
    ...(canManage ? [{ key: 'price', align: 'right' as const, width: 120, dataIndex: 'price', title: 'Цена', sorter: true, render: money }] : []),
    { key: 'cancellationWindowHours', align: 'right' as const, width: 120, dataIndex: 'cancellationWindowHours', title: 'Бесплатная отмена за, ч', sorter: true },
    { key: 'allowMembership', align: 'center', width: 130, dataIndex: 'allowMembership', title: 'Оплата абонементом', render: (value: boolean) => <Tag>{value ? 'Да' : 'Нет'}</Tag> },
  ]
  return <CatalogList<Service> resource="services" storageKey="horse_crm_services_columns_v1" defaultHiddenColumns={['cancellationWindowHours']} title="Услуги" columns={columns} />
}
