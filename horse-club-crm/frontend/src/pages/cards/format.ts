export const dateTime = (value: string | null | undefined) => value
  ? new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Moscow' }).format(new Date(value))
  : '—'

export const dateOnly = (value: string | null | undefined) => value
  ? new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeZone: 'Europe/Moscow' }).format(new Date(value))
  : '—'

export const personName = (person: { name?: string | null; firstName?: string | null; lastName?: string | null }) =>
  [person.firstName, person.lastName].filter(Boolean).join(' ') || person.name || '—'
