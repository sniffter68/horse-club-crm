import { Space, Tag } from 'antd'
import { CatalogList } from '../catalogs/shared'
import type { Stall } from '../catalogs/types'

export function StallList() {
  return <CatalogList<Stall> resource="stalls" title="Денники" columns={[
    { key: 'name', dataIndex: 'name', title: 'Название', sorter: true },
    { key: 'description', dataIndex: 'description', title: 'Описание', width: 420, ellipsis: true,
      render: (value: string | null) => value || '—' },
    { key: 'contracts', title: 'Постой', width: 360, render: (_: unknown, record) => {
      const contracts = record.contracts ?? []
      if (!contracts.length) return <Tag>Свободен</Tag>
      return <Space direction="vertical" size={4}>{contracts.map(contract => <div key={contract.id}>
        <Tag color={contract.status === 'ACTIVE' ? 'green' : contract.status === 'SUSPENDED' ? 'gold' : 'default'}>
          {contract.status === 'ACTIVE' ? 'Активен' : contract.status === 'SUSPENDED' ? 'Приостановлен' : 'Черновик'}
        </Tag>
        {contract.horse.name}
      </div>)}</Space>
    } },
    { key: 'isUnavailable', dataIndex: 'isUnavailable', title: 'Статус', sorter: true,
      render: (value: boolean) => <Tag color={value ? 'red' : 'green'}>{value ? 'Недоступен' : 'Доступен'}</Tag> },
  ]} />
}
