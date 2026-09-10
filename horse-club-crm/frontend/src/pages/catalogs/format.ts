export const money = (value: string | number | null | undefined) => value === undefined || value === null ? '—'
  : new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(Number(value))
