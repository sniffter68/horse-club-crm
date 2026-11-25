import { money } from '../catalogs/format'
import { useCatalogPermissions } from '../catalogs/permissions'
import { Tag, type TableColumnsType } from 'antd'
import { CatalogList } from '../catalogs/shared'
import type { Service } from '../catalogs/types'
import { horseServiceDirection } from '../horses/serviceAvailability'
import { serviceDirectionOptions } from './serviceDirections'

export function ServiceList() {
  const { canManage } = useCatalogPermissions()
  const columns: TableColumnsType<Service> = [
    { key: 'title', fixed: 'left', width: 180, dataIndex: 'title', title: 'Название', sorter: true },
    { key: 'durationMinutes', align: 'right' as const, width: 115, dataIndex: 'durationMinutes', title: 'Длительность, мин', sorter: true },
    { key: 'serviceDirection', width: 210, title: 'Направление', render: (_: unknown, row: Service) => <Tag>{serviceDirectionOptions.find(option => option.value === horseServiceDirection(row))?.label}</Tag> },
    { key: 'maxCapacity', width: 170, dataIndex: 'maxCapacity', title: 'Формат', sorter: true, render: (capacity: number) => <Tag>{capacity > 1 ? `Группа до ${capacity} чел.` : 'Индивидуально'}</Tag> },
    ...(canManage ? [{ key: 'price', align: 'right' as const, width: 120, dataIndex: 'price', title: 'Цена', sorter: true, render: money }] : []),
    { key: 'cancellationWindowHours', align: 'right' as const, width: 120, dataIndex: 'cancellationWindowHours', title: 'Бесплатная отмена за, ч', sorter: true },
    { key: 'allowMembership', align: 'center', width: 130, dataIndex: 'allowMembership', title: 'Оплата абонементом', render: (value: boolean) => <Tag>{value ? 'Да' : 'Нет'}</Tag> },
  ]
  return <CatalogList<Service> resource="services" storageKey="horse_crm_services_columns_v1" defaultHiddenColumns={['cancellationWindowHours']} title="Услуги" columns={columns} />
}
