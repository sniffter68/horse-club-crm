import { useState } from 'react'
import type { ColumnType } from 'antd/es/table'

export type ColumnPreference<K extends string = string> = { key: K; visible: boolean }
export type ColumnDefinition<K extends string = string> = ColumnPreference<K> & { label: string }
export type ConfigurableColumn<T extends object> = ColumnType<T> & { defaultVisible?: boolean }

export function parseColumnPreferences<K extends string>(raw: string | null, defaults: readonly ColumnPreference<K>[]): ColumnPreference<K>[] {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (!Array.isArray(parsed)) return defaults.map(column => ({ ...column }))
    const result: ColumnPreference<K>[] = []
    for (const entry of parsed as unknown[]) {
      if (!entry || typeof entry !== 'object' || !('key' in entry) || !('visible' in entry)) continue
      const definition = defaults.find(column => column.key === entry.key)
      if (definition && typeof entry.visible === 'boolean' && !result.some(column => column.key === definition.key)) {
        result.push({ key: definition.key, visible: entry.visible })
      }
    }
    return [...result, ...defaults.filter(column => !result.some(item => item.key === column.key)).map(column => ({ ...column }))]
  } catch { return defaults.map(column => ({ ...column })) }
}

export function useColumnPreferences<K extends string>(defaults: readonly ColumnPreference<K>[], storageKey: string) {
  const read = () => {
    try { return parseColumnPreferences(localStorage.getItem(storageKey), defaults) }
    catch { return parseColumnPreferences(null, defaults) }
  }
  const [state, setState] = useState(() => ({ key: storageKey, columns: read(), storageError: false }))
  // Consumers can change resource without remounting. Never write one list's settings into another key.
  const current = state.key === storageKey ? state : { key: storageKey, columns: read(), storageError: false }
  const columns = parseColumnPreferences(JSON.stringify(current.columns), defaults)
  function update(next: ColumnPreference<K>[]) {
    const normalized = parseColumnPreferences(JSON.stringify(next), defaults)
    let storageError = false
    try { localStorage.setItem(storageKey, JSON.stringify(normalized)) }
    catch { storageError = true }
    setState({ key: storageKey, columns: normalized, storageError })
  }
  return { columns, update, storageError: current.storageError }
}

export function selectTableColumns<T extends object>(definitions: readonly ConfigurableColumn<T>[], preferences: readonly ColumnPreference[]): ColumnType<T>[] {
  const allowed = definitions.filter(column => !column.hidden)
  const optional = preferences.flatMap(preference => {
    const column = allowed.find(item => !item.fixed && String(item.key) === preference.key)
    return column && preference.visible ? [column] : []
  })
  return [
    ...allowed.filter(column => column.fixed === 'left' || column.fixed === true),
    ...optional,
    ...allowed.filter(column => column.fixed === 'right'),
  ].map(({ defaultVisible: _defaultVisible, ...column }) => column)
}

export function useTableColumns<T extends object>(definitions: readonly ConfigurableColumn<T>[], storageKey: string) {
  const defaults = definitions.filter(column => !column.fixed).map(column => ({ key: String(column.key), visible: column.defaultVisible !== false }))
  const settings = useColumnPreferences(defaults, storageKey)
  const available: ColumnDefinition[] = definitions.filter(column => !column.fixed && !column.hidden).map(column => ({
    key: String(column.key), visible: column.defaultVisible !== false,
    label: typeof column.title === 'string' ? column.title : String(column.key),
  }))
  return { columns: selectTableColumns(definitions, settings.columns), settings, available }
}
