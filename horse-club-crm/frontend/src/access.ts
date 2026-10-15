import { useCallback, useEffect } from 'react'
import { useCustom, usePermissions, type HttpError } from '@refinedev/core'
import type { Role } from './authStorage'
import { API_URL } from './httpClient'

export interface RolePermissions {
  horseReplaceOwn: boolean; horseReplaceAny: boolean; healthRead: boolean;
  healthWrite: boolean; financeRead: boolean; boardingAccess: boolean;
}
export interface AccessSnapshot { userId: string; trainerId: string | null; role: Role; permissions: RolePermissions }
export const fullAccess: RolePermissions = { horseReplaceOwn: true, horseReplaceAny: true, healthRead: true, healthWrite: true, financeRead: true, boardingAccess: true }
const noAccess: RolePermissions = { horseReplaceOwn: false, horseReplaceAny: false, healthRead: false, healthWrite: false, financeRead: false, boardingAccess: false }
export function mayReplaceHorse(role: Role | undefined, snapshot: AccessSnapshot | undefined, trainerId: string | undefined) {
  if (role === 'ADMIN' || role === 'MANAGER') return true
  return role === 'TRAINER' && snapshot?.role === role && snapshot.permissions.horseReplaceOwn && Boolean(trainerId)
    && trainerId === (snapshot.trainerId ?? snapshot.userId)
}
export function useRoleAccess() {
  const { data: role } = usePermissions<Role>({})
  const { query } = useCustom<AccessSnapshot, HttpError>({ url: `${API_URL}/settings/access/me`, method: 'get', errorNotification: false,
    queryOptions: { enabled: role === 'TRAINER', staleTime: 15_000, retry: false, refetchOnWindowFocus: true } })
  const { refetch } = query
  useEffect(() => {
    const refresh = () => { if (role === 'TRAINER') void refetch() }
    window.addEventListener('role-access-changed', refresh)
    return () => window.removeEventListener('role-access-changed', refresh)
  }, [refetch, role])
  const snapshot = query.isError ? undefined : query.data?.data
  const permissions = role === 'ADMIN' || role === 'MANAGER' ? fullAccess : snapshot && snapshot.role === role ? snapshot.permissions : noAccess
  const canReplaceHorse = useCallback((trainerId?: string) => mayReplaceHorse(role, snapshot, trainerId), [role, snapshot])
  return { role, permissions, canReplaceHorse, loading: role === 'TRAINER' && query.isLoading, error: query.error, refresh: refetch }
}
