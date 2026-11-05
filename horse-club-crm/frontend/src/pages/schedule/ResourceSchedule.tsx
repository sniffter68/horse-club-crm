import { useRef, useState, type ReactNode } from 'react'
import type { ScheduleMove } from './reschedule'
import { parallelLayout } from './parallelLayout'
import { Button, Empty, Progress, Tooltip, Popover } from 'antd'
import { DateTime } from 'luxon'
import type { Arena, Horse, Trainer } from '../catalogs/types'
import type { ClubSchedule, DailyHorseWorkload } from './types'
import { CLUB_TIME_ZONE, toInstant } from './time'
import { ScheduleEventContent } from './ScheduleEventContent'
import { eventSummary } from './scheduleEventPresentation'
import { peakOccupancy, type ScheduleEntry, type TriadValues } from './triad'

export type ResourceGrouping = 'calendar' | 'trainers' | 'horses' | 'arenas'
export function ResourceSchedule({ grouping, date, schedule, entries, trainers, horses, arenas, workloads, occupancy, canManage, onBook, onOpen, renderQuick, onMove, moving }: {
  grouping: Exclude<ResourceGrouping, 'calendar'>; date: string; schedule: ClubSchedule; entries: ScheduleEntry[];
  trainers: Trainer[]; horses: Horse[]; arenas: Arena[]; workloads: DailyHorseWorkload[];
  occupancy?: { arenaId: string; occupied: number; maxRidersCapacity: number }[];
  renderQuick: (values: Partial<TriadValues>, close: () => void) => ReactNode;
  onMove: (entry: ScheduleEntry, move: ScheduleMove) => void; moving: boolean;
  canManage: boolean; onBook: (values: Partial<TriadValues>) => void; onOpen: (entry: ScheduleEntry) => void;
}) {
  const [quick, setQuick] = useState<string>()
  const drag = useRef<{ entry: ScheduleEntry; offset: number } | null>(null)
  const suppressClick = useRef(false)
  const quickAnchor = useRef<HTMLButtonElement | null>(null)
  const start = +new Date(toInstant(`${date}T${schedule.openTime}`)), end = +new Date(toInstant(`${date}T${schedule.closeTime}`))
  const scale = 3 // px per minute; preserve the resource timeline scale.
  const height = (end - start) / 60000 * scale
  const resources = grouping === 'trainers' ? trainers.map(t => ({ id: t.id, name: t.fullName || t.name })) : grouping === 'horses' ? [...horses, { id: 'unassigned', name: 'Без лошади' }] : arenas
  const slots = Array.from({ length: Math.ceil((end - start) / 900000) }, (_, i) => start + i * 900000)
  if (!resources.length) return <Empty description="Нет ресурсов для выбранных фильтров" />
  const isDayOff = schedule.daysOfWeekOff.includes(DateTime.fromISO(date, { zone: CLUB_TIME_ZONE }).weekday % 7)
  return <div>
    <div className="resource-legend"><span>День: {date.split('-').reverse().join('.')}</span>{grouping === 'horses' && <span className="resource-rest-key">Штриховка — обязательный отдых лошади</span>}{isDayOff && <span>Выходной день клуба</span>}</div>
    <div className="resource-board" role="region" aria-label="Расписание по ресурсам" tabIndex={0}>
      <div className="resource-board-inner">
        <div className="resource-ruler"><div className="resource-header">Время</div><div style={{ height }}>{slots.map(at => <div key={at} className="resource-tick" style={{ top: (at - start) / 60000 * scale }}>{DateTime.fromMillis(at, { zone: CLUB_TIME_ZONE }).toFormat('HH:mm')}</div>)}</div></div>
        {resources.map(resource => {
          const rows = entries.filter(e => +new Date(e.startTime) < end && +new Date(e.endTime) > start
            && (grouping === 'trainers' ? e.trainerId === resource.id : grouping === 'horses' ? resource.id === 'unassigned' ? !e.horses.length : e.horses.some(h => h.id === resource.id) : e.arenaId === resource.id))
            .sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime) || a.id.localeCompare(b.id))
          const placed = parallelLayout(rows)
          const workload = workloads.find(w => w.horseId === resource.id)
          const arena = arenas.find(a => a.id === resource.id)
          const trainer = trainers.find(t => t.id === resource.id)
          const rests = grouping === 'horses' ? entries.filter(e => e.active && e.horses.some(h => h.id === resource.id)).flatMap(e => {
            const rest = e.horses.find(h => h.id === resource.id)!.restMinutes
            const from = +new Date(e.endTime), to = from + rest * 60000
            return rest > 0 && from < end && to > start ? [{ from, to, rest, id: e.id }] : []
          }) : []
          const minCardWidth = 132
          const parallelWidth = Math.max(0, ...placed.map(row => row.lanes)) * minCardWidth
          return <section key={resource.id} className={`resource-column resource-column--${grouping}`} style={parallelWidth > 260 ? { minWidth: parallelWidth } : undefined} aria-label={resource.name}>
            <header className="resource-header"><strong>{resource.name}</strong>
              {grouping === 'trainers' && <span className="resource-data">Пик за день: {peakOccupancy(rows, start, end)} / {trainer?.maxParallelLessons ?? 4} всадников</span>}
              {grouping === 'horses' && resource.id !== 'unassigned' && (workload ? <><span className="resource-data">{Number(workload.currentWorkloadMinutes.toFixed(1))} / {workload.maxDailyWorkloadMinutes} мин</span><Progress size="small" percent={Math.min(100, workload.currentWorkloadMinutes / workload.maxDailyWorkloadMinutes * 100)} showInfo={false} strokeColor="var(--crm-saddle)" /></> : <span>Нагрузка недоступна</span>)}
              {grouping === 'arenas' && <span className="resource-data">Пик за день: {occupancy?.find(a => a.arenaId === resource.id)?.occupied ?? peakOccupancy(rows, start, end)} / {arena?.maxRidersCapacity ?? arena?.capacity ?? '—'} всадников</span>}
            </header>
            <div className="resource-lane" style={{ height }}
              onDragOver={event => { if (drag.current && canManage && !moving && !isDayOff) { event.preventDefault(); event.dataTransfer.dropEffect = 'move' } }}
              onDrop={event => {
                event.preventDefault()
                const source = drag.current; drag.current = null
                if (!source || !canManage || moving || isDayOff) return
                if (grouping === 'horses' && !source.entry.horses.some(h => h.id === resource.id)) return
                const minutes = Math.round(((event.clientY - event.currentTarget.getBoundingClientRect().top) / scale - source.offset) / 15) * 15
                const at = start + minutes * 60000, until = at + (+new Date(source.entry.endTime) - +new Date(source.entry.startTime))
                if (at < start || until > end) return
                onMove(source.entry, { startTime: new Date(at).toISOString(), endTime: new Date(until).toISOString(), trainerId: grouping === 'trainers' ? resource.id : source.entry.trainerId, arenaId: grouping === 'arenas' ? resource.id : source.entry.arenaId })
              }}>
              {slots.map(at => {
                const key = `${grouping}:${resource.id}:${at}`
                const values: Partial<TriadValues> = { startTime: DateTime.fromMillis(at, { zone: CLUB_TIME_ZONE }).toFormat("yyyy-MM-dd'T'HH:mm"), endTime: DateTime.fromMillis(Math.min(at + 3600000, end), { zone: CLUB_TIME_ZONE }).toFormat("yyyy-MM-dd'T'HH:mm"),
                  ...(grouping === 'trainers' ? { trainerId: resource.id } : grouping === 'horses' ? resource.id === 'unassigned' ? {} : { horseId: resource.id } : { arenaId: resource.id }) }
                return <Popover key={key} trigger="click" open={quick === key} onOpenChange={open => { if (!open) setQuick(undefined) }} placement="bottom" arrow={false} autoAdjustOverflow destroyOnHidden
                  content={quick === key ? <div onKeyDown={event => { if (event.key === 'Escape') { setQuick(undefined); quickAnchor.current?.focus() } }}>{renderQuick(values, () => setQuick(undefined))}</div> : null}>
                  <button type="button" className="resource-slot" style={{ top: (at - start) / 60000 * scale, height: Math.min(15, (end - at) / 60000) * scale }}
                    disabled={!canManage || moving || isDayOff || at + 3600000 > end || rests.some(r => r.from < at + 900000 && r.to > at)}
                    onClick={event => { quickAnchor.current = event.currentTarget; setQuick(key) }} aria-label={`Забронировать: ${resource.name}, ${DateTime.fromMillis(at, { zone: CLUB_TIME_ZONE }).toFormat('HH:mm')}`} />
                </Popover>
              })}
              {rests.map(rest => <div key={rest.id} className="resource-rest" style={{ top: (Math.max(start, rest.from) - start) / 60000 * scale, height: (Math.min(end, rest.to) - Math.max(start, rest.from)) / 60000 * scale }} title={`Отдых ${rest.rest} мин, до ${DateTime.fromMillis(rest.to, { zone: CLUB_TIME_ZONE }).toFormat('HH:mm')}`}><span>Отдых {rest.rest} мин</span></div>)}
              {placed.map(({ entry, lane, lanes }) => {
                const text = eventSummary(entry)
                return <Tooltip key={entry.id} title={text} trigger={['hover', 'focus']}><button type="button" className={`resource-booking ${entry.completed ? 'resource-booking--completed' : !entry.active ? 'resource-booking--cancelled' : ''}`}
                  style={{ top: (Math.max(start, +new Date(entry.startTime)) - start) / 60000 * scale + 2, height: Math.max(0, (Math.min(end, +new Date(entry.endTime)) - Math.max(start, +new Date(entry.startTime))) / 60000 * scale - 4), left: `${lane / lanes * 100}%`, width: `calc(${100 / lanes}% - 4px)` }}
                  draggable={canManage && !moving && entry.active && !entry.completed}
                  aria-busy={moving} onDragStart={event => {
                    setQuick(undefined); suppressClick.current = true
                    drag.current = { entry, offset: (event.clientY - event.currentTarget.getBoundingClientRect().top) / scale }
                    event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', entry.id)
                  }} onDragEnd={() => { drag.current = null; window.setTimeout(() => { suppressClick.current = false }, 0) }}
                  aria-label={text} onClick={() => { if (!suppressClick.current) onOpen(entry) }}>
                  <ScheduleEventContent entry={entry} />
                </button></Tooltip>
              })}
            </div>
          </section>
        })}
      </div>
    </div>
    {canManage && <Button className="resource-book-action" onClick={() => onBook({ startTime: `${date}T${schedule.openTime}` })}>Выбрать время бронирования</Button>}
  </div>
}
