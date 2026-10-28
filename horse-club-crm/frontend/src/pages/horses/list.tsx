import { ProfileHeader, ProfileSection, ProfileFields } from '../cards/ProfileDetails'
import { useState } from 'react'
import { HorseForm } from './form'
import { CatalogEditAction } from '../catalogs/EditDrawer'
import { Empty, List, Space, Tabs, Tag, Typography } from 'antd'
import { money } from '../catalogs/format'
import { CatalogList } from '../catalogs/shared'
import type { Horse, HorseDetails } from '../catalogs/types'
import { dateOnly, dateTime, personName } from '../cards/format'
import { CardLink, DetailsModal } from '../cards/shared'
import { QuickBoardingActions } from '../boarding-contracts/quick'
import { HorseFeeding } from './feeding'
import { HorseBoardingExpenses } from '../stable/boarding'
import { VetJournal } from '../stable/vet'
import { useCatalogPermissions } from '../catalogs/permissions'
import { HorseStatusEditor } from '../stable/horse-status'
import { horseStatuses } from '../stable/types'
import { HorseIssues } from '../schedule/HorseIssues'
import { useRoleAccess } from '../../access'

const healthLabels = { VACCINATION: 'Вакцинация', FARRIER: 'Коваль', DEWORMING: 'Дегельминтизация', INSPECTION: 'Осмотр' }

export function HorseList() {
  const { canManage } = useCatalogPermissions()
  const { permissions } = useRoleAccess()
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
    <DetailsModal<HorseDetails> resource="horses" id={selectedId} title="Карточка лошади" onClose={() => setSelectedId(undefined)} width={960}
      header={horse => <ProfileHeader title="Карточка лошади" name={horse.name}
        badges={<Tag className={`crm-tag crm-tag--${horse.status === 'sick' || horse.status === 'quarantine' ? 'danger' : horse.isUnavailable ? 'warning' : 'success'}`}>{horse.status ? horseStatuses[horse.status] : horse.isUnavailable ? 'Недоступна' : 'Доступна'}</Tag>}
        actions={<><CatalogEditAction resource="horses" id={horse.id}><HorseForm action="edit" /></CatalogEditAction>{canManage && <HorseStatusEditor horse={horse} cardAction />}</>} />} >
      {(horse, ready) => <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <ProfileSection title="Основная информация"><ProfileFields items={[
          { label: 'Порода', value: horse.breed || 'Не указана' },
          { label: 'Масть', value: horse.coat || 'Не указана' },
          { label: 'Год рождения', value: horse.birthYear || 'Не указан' },
          { label: 'Тип принадлежности', value: horse.ownerType === 'private' ? 'Частная' : 'Клубная' },
        ]} /></ProfileSection>
        <ProfileSection title="Рабочие нормативы"><ProfileFields items={[
          { label: 'Лимит дневной нагрузки', value: `${horse.maxDailyMinutes ?? '—'} мин/день` },
          { label: 'Минимальный отдых', value: `${horse.minRestMinutes ?? '—'} мин` },
          { label: 'Рекомендуемый уровень всадника', value: horse.riderLevel || 'Не указан' },
        ]} /></ProfileSection>
        {permissions.boardingAccess && <section><Typography.Title level={5}>Постой</Typography.Title>
          <QuickBoardingActions key={horse.id} context={{ kind: 'HORSE', id: horse.id, name: horse.name, ownerClientId: horse.boardingContracts[0]?.client?.id }}
            contracts={horse.boardingContracts} currentContract={horse.currentBoardingContract} disabled={!ready} />
          {horse.boardingContracts.length ? <List dataSource={horse.boardingContracts} renderItem={contract => <List.Item>
            <Space wrap><Tag color={contract.status === 'ACTIVE' ? 'green' : 'default'}>{contract.status}</Tag>
              <span>{contract.client ? personName(contract.client) : 'Лошадь клуба'}</span><span>Денник: {contract.stall?.name || 'не назначен'}</span>
              {contract.client && <span>{money(contract.monthlyRate)} / мес.</span>}</Space>
          </List.Item>} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Постоя нет" />}
        </section>}
        <HorseFeeding key={horse.id} horse={horse} disabled={!ready} />
        <Tabs destroyOnHidden items={[
          ...(canManage && permissions.boardingAccess ? [{ key: 'boarding', label: 'Постой и расходы', children: <HorseBoardingExpenses horseId={horse.id} privateBoarding={Boolean(horse.currentBoardingContract?.client)} /> }] : []),
          ...(permissions.healthRead ? [{ key: 'vet', label: 'Здоровье и ковка', children: <VetJournal key={horse.id} horseId={horse.id} /> }] : []),
        ]} />
        {permissions.healthRead && <section><Typography.Title level={5}>Журнал здоровья</Typography.Title>
          {horse.healthLogs.length ? <List dataSource={horse.healthLogs} renderItem={log => <List.Item>
            <Space wrap><Tag>{healthLabels[log.type]}</Tag><span>{dateOnly(log.occurredAt)}</span>
              {log.nextDueAt && <span>Следующее: {dateOnly(log.nextDueAt)}</span>}<span>{log.notes || ''}</span></Space>
          </List.Item>} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Записей нет" />}
        </section>}
        <ProfileSection title="Предстоящие занятия и расписание">
          <HorseIssues key={horse.id} horseId={horse.id} />
        </ProfileSection>
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
