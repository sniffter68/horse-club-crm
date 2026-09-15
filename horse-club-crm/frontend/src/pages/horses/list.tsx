import { useState } from 'react'
import { Descriptions, Empty, List, Space, Tag, Typography } from 'antd'
import { money } from '../catalogs/format'
import { CatalogList } from '../catalogs/shared'
import type { Horse, HorseDetails } from '../catalogs/types'
import { dateOnly, dateTime, personName } from '../cards/format'
import { CardLink, DetailsModal } from '../cards/shared'

const healthLabels = { VACCINATION: 'Вакцинация', FARRIER: 'Коваль', DEWORMING: 'Дегельминтизация', INSPECTION: 'Осмотр' }

export function HorseList() {
  const [selectedId, setSelectedId] = useState<string>()
  return <>
    <CatalogList<Horse> resource="horses" title="Лошади" columns={[
      { key: 'name', title: 'Кличка', sorter: true, render: (_: unknown, row) => <CardLink onClick={() => setSelectedId(row.id)}>{row.name}</CardLink> },
      { key: 'breed', dataIndex: 'breed', title: 'Порода', sorter: true },
      { key: 'riderLevel', dataIndex: 'riderLevel', title: 'Уровень всадника', sorter: true },
      { key: 'maxDailyMinutes', dataIndex: 'maxDailyMinutes', title: 'Лимит нагрузки, мин/день', sorter: true },
      { key: 'minRestMinutes', dataIndex: 'minRestMinutes', title: 'Минимальный отдых, мин', sorter: true },
      { key: 'isUnavailable', dataIndex: 'isUnavailable', title: 'Статус', sorter: true,
        render: (value: boolean) => <Tag color={value ? 'red' : 'green'}>{value ? 'Недоступна' : 'Доступна'}</Tag> },
    ]} />
    <DetailsModal<HorseDetails> resource="horses" id={selectedId} title="Карточка лошади" onClose={() => setSelectedId(undefined)}>
      {horse => <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Descriptions bordered size="small" column={{ xs: 1, sm: 2 }} items={[
          { key: 'name', label: 'Кличка', children: horse.name },
          { key: 'status', label: 'Статус', children: <Tag color={horse.isUnavailable ? 'red' : 'green'}>{horse.isUnavailable ? 'Недоступна' : 'Доступна'}</Tag> },
          { key: 'breed', label: 'Порода', children: horse.breed || '—' },
          { key: 'level', label: 'Уровень всадника', children: horse.riderLevel || '—' },
          { key: 'load', label: 'Лимит нагрузки', children: `${horse.maxDailyMinutes} мин/день` },
          { key: 'rest', label: 'Минимальный отдых', children: `${horse.minRestMinutes} мин` },
        ]} />
        <section><Typography.Title level={5}>Постой</Typography.Title>
          {horse.boardingContracts.length ? <List dataSource={horse.boardingContracts} renderItem={contract => <List.Item>
            <Space wrap><Tag color={contract.status === 'ACTIVE' ? 'green' : 'default'}>{contract.status}</Tag>
              <span>{personName(contract.client)}</span><span>Денник: {contract.stall?.name || 'не назначен'}</span>
              <span>{money(contract.monthlyRate)} / мес.</span></Space>
          </List.Item>} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Постоя нет" />}
        </section>
        <section><Typography.Title level={5}>Журнал здоровья</Typography.Title>
          {horse.healthLogs.length ? <List dataSource={horse.healthLogs} renderItem={log => <List.Item>
            <Space wrap><Tag>{healthLabels[log.type]}</Tag><span>{dateOnly(log.occurredAt)}</span>
              {log.nextDueAt && <span>Следующее: {dateOnly(log.nextDueAt)}</span>}<span>{log.notes || ''}</span></Space>
          </List.Item>} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Записей нет" />}
        </section>
        <section><Typography.Title level={5}>Последние занятия</Typography.Title>
          {horse.bookings.length ? <List dataSource={horse.bookings} renderItem={booking => <List.Item>
            <Space wrap><span>{dateTime(booking.lesson.startTime)}</span><strong>{booking.lesson.service.title || booking.lesson.service.name}</strong>
              <span>{personName(booking.client)}</span><Tag>{booking.attendanceStatus}</Tag></Space>
          </List.Item>} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Занятий нет" />}
        </section>
      </Space>}
    </DetailsModal>
  </>
}
