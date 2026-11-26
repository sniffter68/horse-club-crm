import { getMediaUrl } from '../../apiUrl'
import { horseServiceSettings } from './serviceAvailability'
import { ProfileHeader, ProfileSection, ProfileFields } from '../cards/ProfileDetails'
import { Link, useSearchParams } from 'react-router-dom'
import { isUuid } from '../../uuid'
import { useState } from 'react'
import { HorseForm } from './form'
import { CatalogEditAction } from '../catalogs/EditDrawer'
import { Alert, Avatar, Empty, List, Space, Tabs, Tag, Typography } from 'antd'
import { TableCellText } from '../../components/ConfigurableTable'
import { money } from '../catalogs/format'
import { CatalogList } from '../catalogs/shared'
import type { Horse, HorseDetails } from '../catalogs/types'
import { dateTime, personName } from '../cards/format'
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
import { sexes } from '../stalls/mapTypes'

export function HorseList() {
  const { canManage } = useCatalogPermissions()
  const { permissions } = useRoleAccess()
  const [searchParams] = useSearchParams()
  const linkedId = searchParams.get('horseId')
  const [selectedId, setSelectedId] = useState<string | undefined>(linkedId && isUuid(linkedId) ? linkedId : undefined)
  return <>
    <CatalogList<Horse> resource="horses" onSearchSelect={setSelectedId} storageKey="horse_crm_horses_columns_v1" defaultHiddenColumns={['riderLevel', 'minRestMinutes', 'description']} title="Лошади" columns={[
      { key: 'name', fixed: 'left', width: 180, title: 'Кличка / Фото', sorter: true, render: (_: unknown, row) => <Space size={8}><Avatar shape="square" size={32} src={row.imageUrl ? <img src={getMediaUrl(row.imageUrl)} alt={row.name} /> : undefined}>{row.name.slice(0, 1)}</Avatar><CardLink onClick={() => setSelectedId(row.id)}>{row.name}</CardLink></Space> },
      { key: 'breed', align: 'center', width: 130, dataIndex: 'breed', title: 'Порода', sorter: true },
      { key: 'coat', align: 'center', width: 110, dataIndex: 'coat', title: 'Масть' },
      { key: 'description', width: 160, dataIndex: 'description', title: 'Особенности', render: (value: string | null) => <TableCellText>{value}</TableCellText> },
      { key: 'riderLevel', align: 'center', width: 140, dataIndex: 'riderLevel', title: 'Уровень всадника', sorter: true },
      { key: 'maxDailyMinutes', align: 'right', width: 115, dataIndex: 'maxDailyMinutes', title: 'Лимит нагрузки, мин/день', sorter: true },
      { key: 'minRestMinutes', align: 'right', width: 115, dataIndex: 'minRestMinutes', title: 'Минимальный отдых, мин', sorter: true },
      { key: 'isUnavailable', align: 'center', width: 130, dataIndex: 'isUnavailable', title: 'Статус', sorter: true,
        render: (value: boolean, horse) => horse.deletedAt ? <Tag>В архиве</Tag> : <Tag color={value ? 'red' : 'green'}>{value ? 'Недоступна' : 'Доступна'}</Tag> },
    ]} />
    <DetailsModal<HorseDetails> resource="horses" id={selectedId} title="Карточка лошади" onClose={() => setSelectedId(undefined)} width={960}
      header={horse => <ProfileHeader title="Карточка лошади" name={horse.name}
        badges={horse.deletedAt ? <Tag>Лошадь в архиве</Tag> : <Tag className={`crm-tag crm-tag--${horse.status === 'sick' || horse.status === 'quarantine' ? 'danger' : horse.isUnavailable ? 'warning' : 'success'}`}>{horse.status ? horseStatuses[horse.status] : horse.isUnavailable ? 'Недоступна' : 'Доступна'}</Tag>}
        actions={!horse.deletedAt && <><CatalogEditAction resource="horses" id={horse.id}><HorseForm action="edit" /></CatalogEditAction>{canManage && <HorseStatusEditor horse={horse} cardAction />}</>} />} >
      {(horse, ready) => <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <ProfileSection title="Доступность для занятий"><Space wrap>
          {horseServiceSettings.filter(setting => horse[setting.key] !== false).map(setting => <Tag className="crm-tag crm-tag--success" key={setting.key}>{setting.title}</Tag>)}
          {horseServiceSettings.every(setting => horse[setting.key] === false) && <span>Все направления отключены</span>}
        </Space></ProfileSection>
        {horse.deletedAt && <Alert type="info" showIcon message="Лошадь в архиве" description="История занятий, постоя и ветеринарные записи сохранены. Назначение на занятия недоступно." />}
        <ProfileSection title="Основная информация"><ProfileFields items={[
          { label: 'Пол', value: horse.sex ? sexes[horse.sex] : 'Не указан' },
          { label: 'Порода', value: horse.breed || 'Не указана' },
          { label: 'Масть', value: horse.coat || 'Не указана' },
          { label: 'Год рождения', value: horse.birthYear || 'Не указан' },
          { label: 'Тип принадлежности', value: horse.ownerType === 'private' ? 'Частная' : 'Клубная' },
          { label: 'Владелец', value: horse.ownerType === 'club' ? 'Клуб' : horse.owner
            ? isUuid(horse.owner.id) ? <Link to={`/clients?clientId=${horse.owner.id}`}>{personName(horse.owner)}</Link> : personName(horse.owner)
            : 'Не указан' },
          { label: 'Текущий денник и корпус', value: permissions.boardingAccess && horse.stall
            ? <Link to={`/stable?stallId=${horse.stall.id}`}>{horse.stall.building?.name || 'Корпус не указан'} · Денник {horse.stall.number || horse.stall.name}</Link>
            : 'Не назначен' },
          { label: 'Статус постоя', value: horse.currentBoardingContract
            ? horse.currentBoardingContract.status === 'ACTIVE' ? 'Активен' : 'Приостановлен' : 'Нет действующего договора' },
        ]} /></ProfileSection>
        <ProfileSection title="Рабочие нормативы"><ProfileFields items={[
          { label: 'Лимит дневной нагрузки', value: `${horse.maxDailyMinutes ?? '—'} мин/день` },
          { label: 'Минимальный отдых', value: `${horse.minRestMinutes ?? '—'} мин` },
          { label: 'Рекомендуемый уровень всадника', value: horse.riderLevel || 'Не указан' },
        ]} /></ProfileSection>
        {permissions.boardingAccess && <section><Typography.Title level={5}>Постой</Typography.Title>
          {!horse.deletedAt && <QuickBoardingActions key={horse.id} context={{ kind: 'HORSE', id: horse.id, name: horse.name, ownerClientId: horse.owner?.id ?? horse.currentBoardingContract?.client?.id }}
            contracts={horse.boardingContracts} currentContract={horse.currentBoardingContract} disabled={!ready} />}
          {horse.boardingContracts.length ? <List dataSource={horse.boardingContracts} renderItem={contract => <List.Item>
            <Space wrap><Tag color={contract.status === 'ACTIVE' ? 'green' : 'default'}>{contract.status}</Tag>
              <span>{contract.client ? personName(contract.client) : 'Лошадь клуба'}</span><span>Денник: {contract.stall?.name || contract.stall?.number || 'не назначен'}</span>
              {contract.client && <span>{money(contract.monthlyRate)} / мес.</span>}</Space>
          </List.Item>} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Постоя нет" />}
        </section>}
        <HorseFeeding key={horse.id} horse={horse} disabled={!ready || !!horse.deletedAt} />
        <Tabs destroyOnHidden items={[
          ...(canManage && permissions.boardingAccess ? [{ key: 'boarding', label: 'Постой и расходы', children: <HorseBoardingExpenses horseId={horse.id} privateBoarding={Boolean(horse.currentBoardingContract?.client)} /> }] : []),
          ...(permissions.healthRead ? [{ key: 'vet', label: 'Здоровье и ковка', children: <VetJournal key={horse.id} horseId={horse.id} /> }] : []),
        ]} />
        {!horse.deletedAt && <ProfileSection title="Предстоящие занятия и расписание">
          <HorseIssues key={horse.id} horseId={horse.id} />
        </ProfileSection>}
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
