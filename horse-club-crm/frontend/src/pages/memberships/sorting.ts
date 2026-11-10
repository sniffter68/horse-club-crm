import { personName } from '../cards/format'

export type SortField = 'client' | 'service' | 'price' | 'lessons' | 'validUntil' | 'status'
export type SortOrder = 'asc' | 'desc' | null
export interface SortConfig {
  field: SortField | null
  order: SortOrder
}

export interface SortableMembership {
  client: { name?: string | null; firstName?: string | null; lastName?: string | null } | null
  serviceTitle?: string
  pricingPlan: { name: string } | null
  totalPrice?: string | number
  remainedLessons: number
  validUntil: string
  isActive: boolean
}

export function nextMembershipSort(current: SortConfig, field: SortField): SortConfig {
  if (current.field !== field || current.order === null) return { field, order: 'asc' }
  return current.order === 'asc' ? { field, order: 'desc' } : { field: null, order: null }
}

export function membershipServiceTitle(row: SortableMembership): string {
  return row.serviceTitle || row.pricingPlan?.name || 'Индивидуальный'
}

function numericValue(value: number): number | null {
  return Number.isFinite(value) ? value : null
}

function compareNumbers(left: number | null, right: number | null): number {
  if (left === null) return right === null ? 0 : 1
  if (right === null) return -1
  return left - right
}

export function sortMemberships<T extends SortableMembership>(rows: readonly T[], config: SortConfig): T[] {
  const { field, order } = config
  if (!field || !order) return [...rows]
  return [...rows].sort((left, right) => {
    let result: number
    switch (field) {
      case 'client':
        result = (left.client ? personName(left.client) : '').localeCompare(right.client ? personName(right.client) : '', 'ru')
        break
      case 'service':
        result = membershipServiceTitle(left).localeCompare(membershipServiceTitle(right), 'ru')
        break
      case 'price':
        result = compareNumbers(left.totalPrice == null ? null : numericValue(Number(left.totalPrice)), right.totalPrice == null ? null : numericValue(Number(right.totalPrice)))
        break
      case 'lessons':
        result = compareNumbers(numericValue(left.remainedLessons), numericValue(right.remainedLessons))
        break
      case 'validUntil':
        result = compareNumbers(numericValue(new Date(left.validUntil).getTime()), numericValue(new Date(right.validUntil).getTime()))
        break
      case 'status':
        result = Number(right.isActive) - Number(left.isActive)
        break
    }
    return order === 'asc' ? result : -result
  })
}
