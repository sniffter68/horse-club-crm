import { parseColumnPreferences, useColumnPreferences } from '../../hooks/useTableColumns'

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
  return parseColumnPreferences(raw, defaults())
}

export function useClientColumns() {
  return useColumnPreferences(defaults(), CLIENT_COLUMNS_KEY)
}
