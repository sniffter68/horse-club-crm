import { money } from '../catalogs/format'
import { useCatalogPermissions } from '../catalogs/permissions'
import type { TableColumnsType } from 'antd'
import { CatalogList } from '../catalogs/shared'
import type { Trainer } from '../catalogs/types'

export function TrainerList() {
  const { canManage } = useCatalogPermissions()
  const columns: TableColumnsType<Trainer> = [
    { key: 'name', dataIndex: 'name', title: 'ФИО', sorter: true },
    { key: 'qualification', dataIndex: 'qualification', title: 'Квалификация', width: 260 },
    { key: 'maxDailyLoad', dataIndex: 'maxDailyLoad', title: 'Дневная нагрузка, мин', sorter: true },
  ]
  if (canManage) columns.push({ key: 'baseRate', dataIndex: 'baseRate', title: 'Базовая ставка', sorter: true, render: money })
  return <CatalogList<Trainer> resource="trainers" title="Тренеры" columns={columns} />
}
