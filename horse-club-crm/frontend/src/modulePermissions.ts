import { createContext, useContext } from 'react'
import type { Role } from './authStorage'
export const systemModules = ['SCHEDULE', 'STABLES', 'VETERINARY', 'CASHBOX', 'STAFF_PAYROLL'] as const
export type SystemModule = typeof systemModules[number]
export type AccessLevel = 'FULL' | 'READ_ONLY' | 'HIDDEN'
export interface ModulePermission { module: SystemModule; isEnabled: boolean; accessLevel: AccessLevel }
export interface Snapshot { role: Role; modules: ModulePermission[] }
const resources: Record<string, SystemModule> = {
  lessons: 'SCHEDULE', schedule: 'SCHEDULE', 'lesson-history': 'SCHEDULE', bookings: 'SCHEDULE',
  stalls: 'STABLES', stable: 'STABLES', 'stall-map': 'STABLES', 'boarding-contracts': 'STABLES', boarding: 'STABLES',
  vet: 'VETERINARY', 'horse-health-logs': 'VETERINARY',
  payments: 'CASHBOX', 'cash-desk': 'CASHBOX', 'financial-reports': 'CASHBOX',
  staff: 'STAFF_PAYROLL', payroll: 'STAFF_PAYROLL',
}
export const moduleForResource = (resource?: string) => resource ? resources[resource] : undefined
export interface PermissionsState {
  isEnabled: (module: SystemModule) => boolean;
  loading: boolean; error: boolean; canRead: (module: SystemModule) => boolean;
  canWrite: (module: SystemModule) => boolean; refresh: () => Promise<unknown>;
}
export const PermissionsContext = createContext<PermissionsState>({ loading: true, error: false,
  isEnabled: () => false,
  canRead: () => false, canWrite: () => false, refresh: async () => {} })

export const usePermissions = () => useContext(PermissionsContext)
