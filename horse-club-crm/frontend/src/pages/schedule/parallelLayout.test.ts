import { describe, expect, it } from 'vitest'
import { parallelLayout } from './parallelLayout'
import type { ScheduleEntry } from './triad'

const entry = (id: string, start: number, end: number) => ({ id, startTime: new Date(start * 60000).toISOString(), endTime: new Date(end * 60000).toISOString() }) as ScheduleEntry
describe('parallel lesson lanes', () => {
  it('divides two and three simultaneous independent cards evenly', () => {
    for (const count of [2, 3]) {
      const rows = parallelLayout(Array.from({ length: count }, (_, i) => entry(String(i), 0, 60)))
      expect(rows.map(r => r.lane)).toEqual(Array.from({ length: count }, (_, i) => i))
      expect(rows.every(r => r.lanes === count)).toBe(true)
    }
  })
  it('handles chained and nested overlaps and restores full width for adjacent blocks', () => {
    const rows = parallelLayout([entry('a', 0, 30), entry('b', 15, 60), entry('c', 30, 45), entry('d', 60, 90)])
    expect(rows.map(({ lane, lanes }) => [lane, lanes])).toEqual([[0, 2], [1, 2], [0, 2], [0, 1]])
  })
  it('reuses freed lanes inside a long enclosing lesson and is independent of input order', () => {
    const entries = [entry('long', 0, 120), entry('a', 15, 45), entry('b', 30, 60), entry('c', 60, 90)]
    const rows = parallelLayout(entries)
    expect(parallelLayout([...entries].reverse())).toEqual(rows)
    expect(rows.map(({ lane, lanes }) => [lane, lanes])).toEqual([[0, 3], [1, 3], [2, 3], [1, 3]])
    for (const a of rows) for (const b of rows) {
      if (a !== b && a.entry.startTime < b.entry.endTime && a.entry.endTime > b.entry.startTime) {
        expect(a.lane).not.toBe(b.lane)
      }
    }
    expect(rows.map(row => row.entry.id)).toEqual(['long', 'a', 'b', 'c'])
  })
})
