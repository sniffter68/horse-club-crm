import { useState } from 'react'
import { Descriptions, Empty, List, Space, Tag } from 'antd'
import { money } from '../catalogs/format'
import { CatalogList } from '../catalogs/shared'
import type { Stall } from '../catalogs/types'
import { dateOnly, personName } from '../cards/format'
import { CardLink, DetailsModal } from '../cards/shared'

export function StallList() {
  const [selectedId, setSelectedId] = useState<string>()
  return <>
    <CatalogList<Stall> resource="stalls" title="Денники" columns={[
      { key: 'name', title: 'Название', sorter: true, render: (_: unknown, row) => <CardLink onClick={() => setSelectedId(row.id)}>{row.name}</CardLink> },
      { key: 'description', dataIndex: 'description', title: 'Описание', width: 420, ellipsis: true, render: (value: string | null) => value || '—' },
      { key: 'contracts', title: 'Постой', width: 360, render: (_: unknown, record) => {
        const contracts = record.contracts ?? []
        if (!contracts.length) return <Tag>Свободен</Tag>
        return <Space direction="vertical" size={4}>{contracts.map(contract => <div key={contract.id}>
          <Tag color={contract.status === 'ACTIVE' ? 'green' : contract.status === 'SUSPENDED' ? 'gold' : 'default'}>{contract.status}</Tag>
          {contract.horse.name}
        </div>)}</Space>
      } },
      { key: 'isUnavailable', dataIndex: 'isUnavailable', title: 'Статус', sorter: true,
        render: (value: boolean) => <Tag color={value ? 'red' : 'green'}>{value ? 'Недоступен' : 'Доступен'}</Tag> },
    ]} />
    <DetailsModal<Stall> resource="stalls" id={selectedId} title="Карточка денника" onClose={() => setSelectedId(undefined)}>
      {stall => <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Descriptions bordered size="small" column={{ xs: 1, sm: 2 }} items={[
          { key: 'name', label: 'Денник', children: stall.name },
          { key: 'status', label: 'Статус', children: <Tag color={stall.isUnavailable ? 'red' : 'green'}>{stall.isUnavailable ? 'Недоступен' : 'Доступен'}</Tag> },
          { key: 'description', label: 'Описание', span: 2, children: stall.description || '—' },
        ]} />
        {(stall.contracts ?? []).length ? <List dataSource={stall.contracts} renderItem={contract => {
          const pending = (contract.payments ?? []).filter(payment => payment.status === 'PENDING').reduce((sum, payment) => sum + Number(payment.amount), 0)
          return <List.Item><Space wrap><Tag color={contract.status === 'ACTIVE' ? 'green' : 'default'}>{contract.status}</Tag>
            <strong>{contract.horse.name}</strong><span>{personName(contract.client)}</span><span>с {dateOnly(contract.startsAt)}</span>
            {pending > 0 && <Tag color="gold">К оплате {money(pending)}</Tag>}</Space></List.Item>
        }} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Денник свободен" />}
      </Space>}
    </DetailsModal>
  </>
}
