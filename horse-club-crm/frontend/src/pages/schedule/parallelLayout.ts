import type { ScheduleEntry } from './triad'

// Assign lanes within each connected overlap block; adjacent blocks regain full width.
export function parallelLayout(entries: ScheduleEntry[]) {
  const sorted = [...entries].sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime) || a.id.localeCompare(b.id))
  const result: { entry: ScheduleEntry; lane: number; lanes: number }[] = []
  let block: typeof result = [], ends: number[] = [], blockEnd = -Infinity
  const flush = () => { for (const row of block) row.lanes = ends.length; result.push(...block); block = []; ends = []; blockEnd = -Infinity }
  for (const entry of sorted) {
    const start = +new Date(entry.startTime), end = +new Date(entry.endTime)
    if (start >= blockEnd) flush()
    let lane = ends.findIndex(until => until <= start)
    if (lane === -1) lane = ends.length
    ends[lane] = end
    blockEnd = Math.max(blockEnd, end)
    block.push({ entry, lane, lanes: 1 })
  }
  flush()
  return result
}
