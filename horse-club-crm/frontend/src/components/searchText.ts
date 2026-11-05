export function phoneDigits(value: string): string {
  const digits = value.replace(/\D/g, '')
  return digits.length === 11 && /^[78]/.test(digits) ? digits.slice(1) : digits
}

export function matchRange(text: string, query: string): [number, number] | undefined {
  const needle = query.trim().toLocaleLowerCase('ru')
  if (!needle) return undefined
  const start = text.toLocaleLowerCase('ru').indexOf(needle)
  if (start >= 0) return [start, start + needle.length]
  if (!/^[+\d\s()-]+$/.test(needle)) return undefined
  const digits = phoneDigits(needle)
  const positions = [...text.matchAll(/\d/g)].map(match => match.index)
  const raw = positions.map(index => text[index]).join('')
  const offset = raw.indexOf(digits)
  return digits && offset >= 0 ? [positions[offset], positions[offset + digits.length - 1] + 1] : undefined
}

export interface SearchSuggestion { id: string; text: string; detail?: string }

/** Accept API records without relying on Refine's permissive BaseRecord index signature. */
export function recordSuggestion(row: unknown): SearchSuggestion | undefined {
  if (!row || typeof row !== 'object') return undefined
  const field = (key: string): string => key in row && typeof Reflect.get(row, key) === 'string' ? String(Reflect.get(row, key)) : ''
  const id = field('id')
  const related = 'client' in row ? recordSuggestion(Reflect.get(row, 'client')) : undefined
  const text = field('name') || [field('firstName'), field('lastName')].filter(Boolean).join(' ') || field('title') || field('email') || related?.text || field('description')
  const owner: unknown = 'owner' in row ? Reflect.get(row, 'owner') : undefined
  const ownerName = owner && typeof owner === 'object' && 'name' in owner && typeof owner.name === 'string' ? owner.name : ''
  const detail = [field('phone'), field('breed'), ownerName].filter(Boolean).join(' · ')
  return id && text ? { id, text, detail } : undefined
}
