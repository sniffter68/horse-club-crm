import { usePermissions } from '@refinedev/core'
import { Tabs } from 'antd'
import { useSearchParams } from 'react-router-dom'
import type { Role } from '../../authStorage'
import { ModulesSettings } from './Modules'
import { RoleAccessPage } from './RoleAccess'
import { OperationalReset } from './OperationalReset'
import { VkIntegration } from './VkIntegration'
import { ClubScheduleSettings } from './ClubScheduleSettings'
import { ClubNotificationsSettings } from './ClubNotificationsSettings'

export function SettingsPage() {
  const { data: role } = usePermissions<Role>({})
  const [params, setParams] = useSearchParams()
  return <Tabs activeKey={params.get('tab') ?? 'schedule'} onChange={tab => setParams({ tab })} items={[
    { key: 'schedule', label: 'Режим работы', children: <ClubScheduleSettings /> },
    ...((role === 'ADMIN' || role === 'MANAGER') ? [{ key: 'notifications', label: 'Уведомления', children: <ClubNotificationsSettings /> }] : []),
    ...(role === 'ADMIN' ? [{ key: 'vk', label: 'Интеграция VK', children: <VkIntegration /> }] : []),
    ...(role === 'ADMIN' ? [{ key: 'reset', label: 'Очистка тестовых данных', children: <OperationalReset /> }] : []),
    ...(role === 'ADMIN' ? [{ key: 'modules', label: 'Модули и права доступа', children: <ModulesSettings /> }, { key: 'roles', label: 'Роли и доступ', children: <RoleAccessPage /> }] : []),
  ]} />
}
