import type { TableColumnsType } from 'antd'
import { money } from '../catalogs/format'
import { CatalogList } from '../catalogs/shared'
import type { PricingPlan } from './types'

export function PricingPlanList() {
  const columns: TableColumnsType<PricingPlan> = [
    { key: 'name', dataIndex: 'name', title: 'Название', sorter: true },
    { key: 'totalLessons', dataIndex: 'totalLessons', title: 'Количество занятий', sorter: true },
    { key: 'validDays', dataIndex: 'validDays', title: 'Срок действия, дней', sorter: true },
    { key: 'price', dataIndex: 'price', title: 'Цена', sorter: true, render: money },
  ]
  return <CatalogList<PricingPlan> resource="pricing-plans" title="Тарифы" columns={columns} />
}
