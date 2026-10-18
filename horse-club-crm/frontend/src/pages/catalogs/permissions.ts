import { useLocation } from 'react-router-dom'
import { usePermissions as useModules, moduleForResource } from '../../modulePermissions'
import { usePermissions } from '@refinedev/core'
import type { Role } from '../../authStorage'
import { useRoleAccess } from '../../access'

export function useCatalogPermissions(resource?: string) {
  const { data: role, isLoading } = usePermissions<Role>({})
  const access = useRoleAccess()
  const modules = useModules()
  const { pathname } = useLocation()
  const module = moduleForResource(resource) ?? moduleForResource(pathname.split('/')[1])
  return { role, isLoading: isLoading || resource === 'horse-health-logs' && access.loading, canManage: (!module || modules.canWrite(module)) && (resource === 'horse-health-logs' ? access.permissions.healthWrite : role === 'ADMIN' || role === 'MANAGER') }
}

