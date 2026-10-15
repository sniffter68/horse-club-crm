export const STABLE_PAGE_SIZE = 20
// BoardingQueryDto limits each request to 100 records; Prisma skip is a 32-bit integer.
const MAX_LIMIT = 100
const MAX_OFFSET = 2_147_483_647

function positiveInteger(value: unknown, fallback: number, maximum: number): number {
  if (typeof value !== 'number' && typeof value !== 'string') return fallback
  if (typeof value === 'string' && !value.trim()) return fallback
  const number = Number(value)
  if (!Number.isFinite(number) || number < 1) return fallback
  return Math.min(maximum, Math.trunc(number))
}

export function stablePagination(pageValue: unknown, limitValue: unknown = STABLE_PAGE_SIZE) {
  const limit = positiveInteger(limitValue, STABLE_PAGE_SIZE, MAX_LIMIT)
  const page = positiveInteger(pageValue, 1, Math.floor(MAX_OFFSET / limit) + 1)
  return { page, limit, offset: (page - 1) * limit }
}

/** Final query validation before Refine serializes values for the API. */
export function stableListQuery({ offset, limit, ...filters }: Record<string, unknown>) {
  const safeOffset = Number.isInteger(Number(offset)) && Number(offset) >= 0 ? Number(offset) : 0
  const safeLimit = Number.isInteger(Number(limit)) && Number(limit) > 0 ? Number(limit) : 20
  const validFilters = Object.fromEntries(Object.entries(filters).filter(([, value]) =>
    value !== undefined && value !== null && !(typeof value === 'number' && Number.isNaN(value))
    // Reject invalid values that may already have been serialized into the path.
    && !(typeof value === 'string' && ['undefined', 'null', 'NaN'].includes(value.trim())),
  ))
  return { ...validFilters, offset: Math.min(safeOffset, MAX_OFFSET), limit: Math.min(safeLimit, MAX_LIMIT) }
}
