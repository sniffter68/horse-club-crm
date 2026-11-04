import type { TableColumnsType } from 'antd'
import { money } from '../catalogs/format'
import { CatalogList } from '../catalogs/shared'
import type { PricingPlan } from './types'

export function PricingPlanList() {
  const columns: TableColumnsType<PricingPlan> = [
    { key: 'name', fixed: 'left', width: 180, dataIndex: 'name', title: 'Название', sorter: true },
    { key: 'totalLessons', align: 'right', width: 120, dataIndex: 'totalLessons', title: 'Количество занятий', sorter: true },
    { key: 'validDays', align: 'right', width: 120, dataIndex: 'validDays', title: 'Срок действия, дней', sorter: true },
    { key: 'price', align: 'right', width: 130, dataIndex: 'price', title: 'Цена', sorter: true, render: money },
  ]
  return <CatalogList<PricingPlan> resource="pricing-plans" storageKey="horse_crm_pricing_plans_columns_v1" title="Тарифы" columns={columns} />
}
