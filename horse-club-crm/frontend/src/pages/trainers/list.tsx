import { money } from '../catalogs/format'
import { useState } from 'react'
import { Descriptions } from 'antd'
import { CardLink, DetailsModal } from '../cards/shared'
import { CatalogEditAction } from '../catalogs/EditDrawer'
import { TrainerForm } from './form'
import { VkProfileLink } from '../../components/VkProfileLink'
import { useCatalogPermissions } from '../catalogs/permissions'
import type { TableColumnsType } from 'antd'
import { CatalogList } from '../catalogs/shared'
import type { Trainer } from '../catalogs/types'
import { usePermissions } from '../../modulePermissions'

export function TrainerList() {
  const [selectedId, setSelectedId] = useState<string>()
  const { canManage } = useCatalogPermissions()
  const { canRead } = usePermissions()
  const columns: TableColumnsType<Trainer> = [
    { key: 'name', title: 'ФИО', sorter: true, render: (_, row) => <CardLink onClick={() => setSelectedId(row.id)}>{row.name}</CardLink> },
    { key: 'vk', title: 'VK', hidden: !canManage, width: 210, render: (_: unknown, row) => <VkProfileLink id={row.id} name={row.name} kind="TRAINER" vkUserId={row.vkUserId} /> },
    { key: 'qualification', dataIndex: 'qualification', title: 'Квалификация', width: 260 },
    { key: 'maxDailyLoad', dataIndex: 'maxDailyLoad', title: 'Дневная нагрузка, мин', sorter: true },
  ]
  if (canManage && canRead('STAFF_PAYROLL')) columns.push({ key: 'baseRate', dataIndex: 'baseRate', title: 'Базовая ставка', sorter: true, render: money })
  return <><CatalogList<Trainer> resource="trainers" title="Тренеры" columns={columns} />
    <DetailsModal<Trainer> resource="trainers" id={selectedId} title="Карточка тренера" onClose={() => setSelectedId(undefined)}>
      {trainer => <><CatalogEditAction resource="trainers" id={trainer.id}><TrainerForm action="edit" /></CatalogEditAction>
        <Descriptions bordered column={1} style={{ marginTop: 16 }} items={[
          { key: 'name', label: 'ФИО', children: trainer.name },
          { key: 'phone', label: 'Телефон', children: trainer.phone || '—' },
          { key: 'qualification', label: 'Специализация', children: trainer.qualification || '—' },
          ...(canManage && canRead('STAFF_PAYROLL') ? [{ key: 'rate', label: 'Ставка', children: money(trainer.baseRate) }] : []),
        ]} /></>}
    </DetailsModal></>
}
