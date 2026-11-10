import { describe, expect, it } from 'vitest'
import { nextMembershipSort, sortMemberships, type SortableMembership, type SortField } from './sorting'

const rows: (SortableMembership & { id: string })[] = [
  { id: 'b', client: { name: 'Борис' }, serviceTitle: 'Выездка', pricingPlan: null, totalPrice: '8000.50', remainedLessons: 10, validUntil: '2027-01-02', isActive: false },
  { id: 'a', client: { name: 'Анна' }, pricingPlan: { name: 'Абонемент' }, totalPrice: '12000', remainedLessons: 2, validUntil: '2026-12-31', isActive: true },
  { id: 'c', client: null, pricingPlan: null, totalPrice: undefined, remainedLessons: 0, validUntil: '', isActive: false },
]

describe('membership sorting', () => {
  it('cycles through ascending, descending and original order; changing field starts ascending', () => {
    const asc = nextMembershipSort({ field: null, order: null }, 'client')
    expect(asc).toEqual({ field: 'client', order: 'asc' })
    const desc = nextMembershipSort(asc, 'client')
    expect(desc).toEqual({ field: 'client', order: 'desc' })
    expect(nextMembershipSort(desc, 'client')).toEqual({ field: null, order: null })
    expect(nextMembershipSort(desc, 'price')).toEqual({ field: 'price', order: 'asc' })
  })

  it.each<[SortField, string[]]>([
    ['client', ['a', 'b']], ['service', ['a', 'b']], ['price', ['b', 'a']],
    ['lessons', ['a', 'b']], ['validUntil', ['a', 'b']], ['status', ['a', 'b']],
  ])('compares %s using its raw value in both directions', (field, expected) => {
    expect(sortMemberships(rows.slice(0, 2), { field, order: 'asc' }).map(row => row.id)).toEqual(expected)
    expect(sortMemberships(rows.slice(0, 2), { field, order: 'desc' }).map(row => row.id)).toEqual([...expected].reverse())
  })

  it('keeps ties stable, tolerates missing values and never mutates the source', () => {
    const original = rows.map(row => row.id)
    expect(sortMemberships(rows, { field: 'status', order: 'asc' }).map(row => row.id)).toEqual(['a', 'b', 'c'])
    expect(sortMemberships(rows, { field: 'price', order: 'asc' }).map(row => row.id)).toEqual(['b', 'a', 'c'])
    expect(sortMemberships(rows, { field: 'validUntil', order: 'asc' }).map(row => row.id)).toEqual(['a', 'b', 'c'])
    expect(rows.map(row => row.id)).toEqual(original)
    expect(sortMemberships(rows, { field: null, order: null }).map(row => row.id)).toEqual(original)
  })
})
