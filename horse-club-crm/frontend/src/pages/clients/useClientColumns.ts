import { useState } from 'react'

export const CLIENT_COLUMNS_KEY = 'horse_crm_clients_columns_v1'
export const optionalColumns = [
  { key: 'clientType', label: 'Тип', visible: true },
  { key: 'membership', label: 'Абонемент', visible: true },
  { key: 'vk', label: 'VK', visible: false },
  { key: 'roles', label: 'Роли', visible: false },
  { key: 'preferences', label: 'Заметки', visible: false },
  { key: 'createdAt', label: 'Дата создания', visible: false },
] as const
export type ColumnKey = typeof optionalColumns[number]['key']
type ColumnPreference = { key: ColumnKey; visible: boolean }
export const defaults = (): ColumnPreference[] => optionalColumns.map(({ key, visible }) => ({ key, visible }))

export function parseClientColumns(raw: string | null): ColumnPreference[] {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (!Array.isArray(parsed)) return defaults()
    const result: ColumnPreference[] = []
    for (const entry of parsed as unknown[]) {
      if (!entry || typeof entry !== 'object' || !('key' in entry) || !('visible' in entry)) continue
      const definition = optionalColumns.find(column => column.key === entry.key)
      if (definition && typeof entry.visible === 'boolean' && !result.some(column => column.key === definition.key)) {
        result.push({ key: definition.key, visible: entry.visible })
      }
    }
    return [...result, ...defaults().filter(column => !result.some(item => item.key === column.key))]
  } catch { return defaults() }
}

export function useClientColumns() {
  const [columns, setColumns] = useState(() => {
    try { return parseClientColumns(localStorage.getItem(CLIENT_COLUMNS_KEY)) }
    catch { return defaults() }
  })
  const [storageError, setStorageError] = useState(false)
  function update(next: ColumnPreference[]) {
    setColumns(next)
    try {
      localStorage.setItem(CLIENT_COLUMNS_KEY, JSON.stringify(next))
      setStorageError(false)
    } catch { setStorageError(true) }
  }
  return { columns, update, storageError }
}
