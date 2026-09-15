import { useState } from 'react'
import { Descriptions, List, Space, Tag, Typography } from 'antd'
import { money } from '../catalogs/format'
import { CatalogList } from '../catalogs/shared'
import { dateOnly, dateTime, personName } from '../cards/format'
import { CardLink, DetailsModal } from '../cards/shared'
import type { BoardingContract, BoardingContractStatus } from './types'

const statusLabels: Record<BoardingContractStatus, string> = {
  DRAFT: 'Черновик', ACTIVE: 'Активен', SUSPENDED: 'Приостановлен', TERMINATED: 'Завершён', EXPIRED: 'Истёк',
}
const statusColors: Record<BoardingContractStatus, string> = {
  DRAFT: 'default', ACTIVE: 'green', SUSPENDED: 'gold', TERMINATED: 'blue', EXPIRED: 'red',
}

export function BoardingContractList() {
  const [selectedId, setSelectedId] = useState<string>()
  return <>
    <CatalogList<BoardingContract> resource="boarding-contracts" title="Договоры постоя" columns={[
      { key: 'client', title: 'Клиент', render: (_: unknown, record) => <CardLink onClick={() => setSelectedId(record.id)}>{personName(record.client)}</CardLink> },
      { key: 'horse', dataIndex: ['horse', 'name'], title: 'Лошадь' },
      { key: 'stall', title: 'Денник', render: (_: unknown, record) => record.stall?.name || '—' },
      { key: 'status', dataIndex: 'status', title: 'Статус', sorter: true, render: (value: BoardingContractStatus) => <Tag color={statusColors[value]}>{statusLabels[value]}</Tag> },
      { key: 'startsAt', dataIndex: 'startsAt', title: 'Начало', sorter: true, render: dateOnly },
      { key: 'endsAt', dataIndex: 'endsAt', title: 'Окончание', sorter: true, render: dateOnly },
      { key: 'monthlyRate', dataIndex: 'monthlyRate', title: 'В месяц', sorter: true, render: money },
      { key: 'payments', title: 'Оплаты', render: (_: unknown, record) => {
        const paid = record.payments.filter(payment => payment.status === 'PAID').reduce((sum, payment) => sum + Number(payment.amount), 0)
        const pending = record.payments.filter(payment => payment.status === 'PENDING').reduce((sum, payment) => sum + Number(payment.amount), 0)
        return <Space direction="vertical" size={2}>{paid > 0 && <Tag color="green">Оплачено: {money(paid)}</Tag>}{pending > 0 && <Tag color="gold">К оплате: {money(pending)}</Tag>}{paid === 0 && pending === 0 && 'Нет начислений'}</Space>
      } },
    ]} />
    <DetailsModal<BoardingContract> resource="boarding-contracts" id={selectedId} title="Карточка договора постоя" onClose={() => setSelectedId(undefined)}>
      {contract => <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Descriptions bordered size="small" column={2} items={[
          { key: 'client', label: 'Клиент', children: personName(contract.client) },
          { key: 'horse', label: 'Лошадь', children: contract.horse.name },
          { key: 'stall', label: 'Денник', children: contract.stall?.name || 'Не назначен' },
          { key: 'status', label: 'Статус', children: <Tag color={statusColors[contract.status]}>{statusLabels[contract.status]}</Tag> },
          { key: 'period', label: 'Период', children: `${dateOnly(contract.startsAt)} — ${dateOnly(contract.endsAt)}` },
          { key: 'rate', label: 'Стоимость в месяц', children: money(contract.monthlyRate) },
          { key: 'notes', label: 'Заметки', span: 2, children: contract.notes || '—' },
        ]} />
        <section><Typography.Title level={5}>Начисления и оплаты</Typography.Title>
          <List dataSource={contract.payments} locale={{ emptyText: 'Начислений нет' }} renderItem={payment => <List.Item>
            <Space wrap><Tag color={payment.status === 'PAID' ? 'green' : payment.status === 'PENDING' ? 'gold' : 'default'}>{payment.status}</Tag>
              <strong>{money(payment.amount)}</strong><span>{dateTime(payment.paidAt || payment.createdAt)}</span></Space>
          </List.Item>} />
        </section>
      </Space>}
    </DetailsModal>
  </>
}
