import { usePermissions } from '@refinedev/core'
import type { Role } from '../../authStorage'

export function useCatalogPermissions() {
  const { data: role, isLoading } = usePermissions<Role>({})
  return { role, isLoading, canManage: role === 'ADMIN' || role === 'MANAGER' }
}

