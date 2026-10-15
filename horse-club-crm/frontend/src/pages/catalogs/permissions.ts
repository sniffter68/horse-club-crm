import { usePermissions } from '@refinedev/core'
import type { Role } from '../../authStorage'
import { useRoleAccess } from '../../access'

export function useCatalogPermissions(resource?: string) {
  const { data: role, isLoading } = usePermissions<Role>({})
  const access = useRoleAccess()
  return { role, isLoading: isLoading || resource === 'horse-health-logs' && access.loading, canManage: resource === 'horse-health-logs' ? access.permissions.healthWrite : role === 'ADMIN' || role === 'MANAGER' }
}

