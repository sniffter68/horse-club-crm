import { useEffect, type ReactNode } from 'react'
import { useCustom, usePermissions as useRole } from '@refinedev/core'
import { Alert, Button, Result, Spin } from 'antd'
import { Link, useLocation } from 'react-router-dom'
import type { Role } from './authStorage'
import { API_URL } from './httpClient'

import { PermissionsContext, usePermissions, moduleForResource, type SystemModule, type Snapshot } from './modulePermissions'
export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { data: role, isLoading } = useRole<Role>({})
  const { query } = useCustom<Snapshot>({ url: `${API_URL}/settings/my-permissions`, method: 'get', errorNotification: false,
    queryOptions: { queryKey: ['system-module-permissions', role], enabled: Boolean(role), staleTime: 15_000, refetchInterval: 30_000, refetchOnWindowFocus: true, retry: false } })
  const { refetch } = query
  useEffect(() => {
    const refresh = () => { void refetch() }
    window.addEventListener('module-permissions-changed', refresh)
    return () => window.removeEventListener('module-permissions-changed', refresh)
  }, [refetch])
  const candidate = query.data?.data
  const snapshot = !query.isError && candidate && candidate.role === role && Array.isArray(candidate.modules) &&
    candidate.modules.every(row => typeof row.isEnabled === 'boolean' && ['FULL', 'READ_ONLY', 'HIDDEN'].includes(row.accessLevel)) ? candidate : undefined
  const permission = (module: SystemModule) => snapshot?.modules.find(row => row.module === module && row.isEnabled)
  return <PermissionsContext.Provider value={{ loading: isLoading || query.isLoading, error: query.isError || query.isSuccess && !snapshot,
    isEnabled: module => Boolean(permission(module)),
    canRead: module => Boolean(permission(module) && permission(module)?.accessLevel !== 'HIDDEN'),
    canWrite: module => permission(module)?.accessLevel === 'FULL', refresh: refetch }}>{children}</PermissionsContext.Provider>
}
export function ModuleGuard({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const access = usePermissions()
  const module = moduleForResource(pathname.split('/')[1])
  if (!module) return <>{children}</>
  if (access.loading) return <div className="loading-page"><Spin aria-label="Проверка доступа" /></div>
  if (access.error) return <Alert type="error" showIcon message="Не удалось проверить права доступа" action={<Button onClick={() => void access.refresh()}>Повторить</Button>} />
  if (!access.canRead(module) || (/\/(new|edit)(\/|$)/.test(pathname) && !access.canWrite(module)))
    return <Result status="403" title="Раздел недоступен или отключен в настройках клуба" extra={<Link to="/">Вернуться на главную</Link>} />
  return <>{children}</>
}
