import { Tag } from 'antd'
import dayjs from 'dayjs'
import { money } from '../catalogs/format'
import { CatalogList } from '../catalogs/shared'
import type { BoardingContract, BoardingContractStatus } from './types'

const statusLabels: Record<BoardingContractStatus, string> = {
  DRAFT: 'Черновик',
  ACTIVE: 'Активен',
  SUSPENDED: 'Приостановлен',
  TERMINATED: 'Завершён',
  EXPIRED: 'Истёк',
}
const statusColors: Record<BoardingContractStatus, string> = {
  DRAFT: 'default', ACTIVE: 'green', SUSPENDED: 'gold', TERMINATED: 'blue', EXPIRED: 'red',
}
function date(value: string | null): string {
  return value ? dayjs(value).format('DD.MM.YYYY') : '—'
}
function clientName(contract: BoardingContract): string {
  return [contract.client.firstName, contract.client.lastName].filter(Boolean).join(' ') || contract.client.name || '—'
}

export function BoardingContractList() {
  return <CatalogList<BoardingContract> resource="boarding-contracts" title="Договоры постоя" columns={[
    { key: 'client', title: 'Клиент', render: (_: unknown, record) => clientName(record) },
    { key: 'horse', dataIndex: ['horse', 'name'], title: 'Лошадь' },
    { key: 'stall', title: 'Денник', render: (_: unknown, record) => record.stall?.name || '—' },
    { key: 'status', dataIndex: 'status', title: 'Статус', sorter: true,
      render: (value: BoardingContractStatus) => <Tag color={statusColors[value]}>{statusLabels[value]}</Tag> },
    { key: 'startsAt', dataIndex: 'startsAt', title: 'Начало', sorter: true, render: (value: string) => date(value) },
    { key: 'endsAt', dataIndex: 'endsAt', title: 'Окончание', sorter: true, render: (value: string | null) => date(value) },
    { key: 'monthlyRate', dataIndex: 'monthlyRate', title: 'В месяц', sorter: true,
      render: (value: string | number) => money(value) },
  ]} />
}
