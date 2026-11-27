import { StallRiskSettings } from './StallRiskSettings'
import { useCatalogPermissions } from '../catalogs/permissions'
import { useState } from 'react'
import { Button, Empty, List, Popover, Space, Tag } from 'antd'
import { money } from '../catalogs/format'
import { CatalogList } from '../catalogs/shared'
import type { Stall } from '../catalogs/types'
import { dateOnly, personName } from '../cards/format'
import { CardLink } from '../cards/shared'
import { QuickBoardingActions } from '../boarding-contracts/quick'
import { StallDeleteAction } from './delete'
import { CatalogEditAction } from '../catalogs/EditDrawer'
import { StallForm } from './form'
import { StallDetailsCard } from './card'

export function StallList() {
  const { canManage } = useCatalogPermissions('stalls')
  const [selectedId, setSelectedId] = useState<string>()
  const [riskOpen, setRiskOpen] = useState(false)
  return <>
    <CatalogList<Stall> resource="stalls" title="Денники" toolbar={<Popover trigger="click" open={riskOpen} onOpenChange={setRiskOpen}
      title="Проверка соседства" content={<div className="stall-risk-popover"><StallRiskSettings canManage={canManage} /></div>}>
      <Button aria-expanded={riskOpen} onClick={() => setRiskOpen(!riskOpen)}>Проверка соседства</Button>
    </Popover>} editAction={stall => <CatalogEditAction resource="stalls" id={stall.id}><StallForm action="edit" /></CatalogEditAction>} extraActions={stall => <StallDeleteAction id={stall.id} />} columns={[
      { key: 'name', title: 'Название', sorter: true, render: (_: unknown, row) => <CardLink onClick={() => setSelectedId(row.id)}>{row.name || `Денник ${row.number ?? 'без номера'}`}</CardLink> },
      { key: 'number', title: 'Номер', align: 'right', render: (_: unknown, row) => row.type === 'SERVICE' ? null : row.number },
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
    {selectedId && <StallDetailsCard key={selectedId} id={selectedId} onClose={() => setSelectedId(undefined)}>
      {stall => <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {stall.type !== 'SERVICE' && <QuickBoardingActions key={stall.id} context={{ kind: 'STALL', id: stall.id, name: stall.name || `Денник ${stall.number ?? 'без номера'}`, isUnavailable: stall.isUnavailable }} contracts={stall.contracts ?? []} />}
        {(stall.contracts ?? []).length ? <List dataSource={stall.contracts} renderItem={contract => {
          const pending = (contract.payments ?? []).filter(payment => payment.status === 'PENDING').reduce((sum, payment) => sum + Number(payment.amount), 0)
          return <List.Item><Space wrap><Tag color={contract.status === 'ACTIVE' ? 'green' : 'default'}>{contract.status}</Tag>
            <strong>{contract.horse.name}</strong><span>{contract.client ? personName(contract.client) : 'Лошадь клуба'}</span><span>с {dateOnly(contract.startsAt)}</span>
            {pending > 0 && <Tag color="gold">К оплате {money(pending)}</Tag>}</Space></List.Item>
        }} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={stall.type === 'SERVICE' ? 'Постой не предусмотрен' : stall.horseId ? 'Нет договора постоя' : 'Денник свободен'} />}
      </Space>}
    </StallDetailsCard>}
  </>
}
