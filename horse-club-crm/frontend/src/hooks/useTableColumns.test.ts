import { describe, expect, it } from 'vitest'
import { parseColumnPreferences, selectTableColumns, type ConfigurableColumn } from './useTableColumns'

const defaults = [{ key: 'status', visible: true }, { key: 'notes', visible: false }]

describe('shared table preferences', () => {
  it('recovers from invalid storage and reconciles schema changes without duplicates', () => {
    for (const raw of [null, '{broken', '{}', 'null', '42']) expect(parseColumnPreferences(raw, defaults)).toEqual(defaults)
    expect(parseColumnPreferences(JSON.stringify([
      { key: 'notes', visible: true }, { key: 'notes', visible: false },
      { key: 'deleted', visible: true }, { key: 'status', visible: 'yes' }, null,
    ]), defaults)).toEqual([{ key: 'notes', visible: true }, defaults[0]])
  })

  it('never lets stored settings unhide restricted fields or move/hide fixed columns', () => {
    const definitions: ConfigurableColumn<{ id: string }>[] = [
      { key: 'name', fixed: 'left' }, { key: 'status' }, { key: 'notes' },
      { key: 'salary', hidden: true }, { key: 'actions', fixed: 'right' },
    ]
    const preferences = [
      { key: 'actions', visible: false }, { key: 'notes', visible: true },
      { key: 'salary', visible: true }, { key: 'name', visible: false }, { key: 'status', visible: true },
    ]
    expect(selectTableColumns(definitions, preferences).map(column => column.key)).toEqual(['name', 'notes', 'status', 'actions'])
    expect(selectTableColumns(definitions.filter(column => column.key !== 'actions'), preferences).map(column => column.key))
      .toEqual(['name', 'notes', 'status'])
  })
})
