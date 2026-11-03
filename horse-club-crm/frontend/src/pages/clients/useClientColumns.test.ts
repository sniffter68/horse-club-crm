import { describe, expect, it } from 'vitest'
import { defaults, parseClientColumns } from './useClientColumns'

describe('client column preferences', () => {
  it('recovers defaults from missing, corrupt or unexpected storage', () => {
    for (const raw of [null, '{broken', '{}', 'null', '42']) expect(parseClientColumns(raw)).toEqual(defaults())
  })
  it('keeps valid order and visibility, ignores duplicates and unknown fields, appends missing columns', () => {
    const parsed = parseClientColumns(JSON.stringify([
      { key: 'createdAt', visible: true }, { key: 'roles', visible: false },
      { key: 'roles', visible: true }, { key: 'actions', visible: false },
      { key: 'membership', visible: 'yes' }, null,
    ]))
    expect(parsed.slice(0, 2)).toEqual([{ key: 'createdAt', visible: true }, { key: 'roles', visible: false }])
    expect(parsed).toHaveLength(defaults().length)
    expect(parsed.find(column => column.key === 'membership')?.visible).toBe(true)
  })
})
