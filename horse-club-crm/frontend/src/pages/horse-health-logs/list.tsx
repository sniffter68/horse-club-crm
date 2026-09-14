import { Tag } from 'antd'
import dayjs from 'dayjs'
import { CatalogList } from '../catalogs/shared'
import type { HealthLogType, HorseHealthLog } from './types'

const typeLabels: Record<HealthLogType, string> = {
  VACCINATION: 'Вакцинация',
  FARRIER: 'Коваль',
  DEWORMING: 'Дегельминтизация',
  INSPECTION: 'Осмотр',
}

const typeColors: Record<HealthLogType, string> = {
  VACCINATION: 'blue',
  FARRIER: 'gold',
  DEWORMING: 'purple',
  INSPECTION: 'green',
}

function formatDate(value: string | null): string {
  return value ? dayjs(value).format('DD.MM.YYYY HH:mm') : '—'
}

export function HorseHealthLogList() {
  return <CatalogList<HorseHealthLog> resource="horse-health-logs" title="Журнал здоровья" columns={[
    { key: 'horse', dataIndex: ['horse', 'name'], title: 'Лошадь' },
    { key: 'type', dataIndex: 'type', title: 'Событие', sorter: true,
      render: (value: HealthLogType) => <Tag color={typeColors[value]}>{typeLabels[value]}</Tag> },
    { key: 'occurredAt', dataIndex: 'occurredAt', title: 'Дата события', sorter: true,
      render: (value: string) => formatDate(value) },
    { key: 'nextDueAt', dataIndex: 'nextDueAt', title: 'Следующая дата', sorter: true,
      render: (value: string | null) => value
        ? <Tag color={dayjs(value).isBefore(dayjs()) ? 'red' : 'default'}>{formatDate(value)}</Tag>
        : '—' },
    { key: 'notes', dataIndex: 'notes', title: 'Заметки', ellipsis: true },
  ]} />
}
