import type { ReactNode } from 'react'
import { Result, Spin } from 'antd'
import { useRoleAccess, type RolePermissions } from '../access'
export function PermissionGate({ permission, children }: { permission: keyof RolePermissions; children: ReactNode }) {
  const { permissions, loading } = useRoleAccess()
  if (loading) return <Spin aria-label="Проверка доступа" />
  if (!permissions[permission]) return <Result status="403" title="У вашей роли нет доступа к этому разделу" />
  return <>{children}</>
}
