import { Button, Empty, Progress, Tooltip } from 'antd'
import { DateTime } from 'luxon'
import type { Arena, Horse, Trainer } from '../catalogs/types'
import type { ClubSchedule, DailyHorseWorkload } from './types'
import { CLUB_TIME_ZONE, toInstant } from './time'
import { entryStatusLabel, peakOccupancy, type ScheduleEntry, type TriadValues } from './triad'

export type ResourceGrouping = 'calendar' | 'trainers' | 'horses' | 'arenas'
const clock = (value: string) => DateTime.fromISO(value, { zone: CLUB_TIME_ZONE }).toFormat('HH:mm')
export function ResourceSchedule({ grouping, date, schedule, entries, trainers, horses, arenas, workloads, occupancy, canManage, onBook, onOpen }: {
  grouping: Exclude<ResourceGrouping, 'calendar'>; date: string; schedule: ClubSchedule; entries: ScheduleEntry[];
  trainers: Trainer[]; horses: Horse[]; arenas: Arena[]; workloads: DailyHorseWorkload[];
  occupancy?: { arenaId: string; occupied: number; maxRidersCapacity: number }[];
  canManage: boolean; onBook: (values: Partial<TriadValues>) => void; onOpen: (entry: ScheduleEntry) => void;
}) {
  const start = +new Date(toInstant(`${date}T${schedule.openTime}`)), end = +new Date(toInstant(`${date}T${schedule.closeTime}`))
  const scale = 3 // px per minute: 30-minute cards retain room for horse, trainer and rider.
  const height = (end - start) / 60000 * scale
  const resources = grouping === 'trainers' ? trainers.map(t => ({ id: t.id, name: t.fullName || t.name })) : grouping === 'horses' ? horses : arenas
  const slots = Array.from({ length: Math.ceil((end - start) / 1800000) }, (_, i) => start + i * 1800000)
  if (!resources.length) return <Empty description="Нет ресурсов для выбранных фильтров" />
  const isDayOff = schedule.daysOfWeekOff.includes(DateTime.fromISO(date, { zone: CLUB_TIME_ZONE }).weekday % 7)
  return <div>
    <div className="resource-legend"><span>День: {date.split('-').reverse().join('.')}</span>{grouping === 'horses' && <span className="resource-rest-key">Штриховка — обязательный отдых лошади</span>}{isDayOff && <span>Выходной день клуба</span>}</div>
    <div className="resource-board" role="region" aria-label="Расписание по ресурсам" tabIndex={0}>
      <div className="resource-board-inner">
        <div className="resource-ruler"><div className="resource-header">Время</div><div style={{ height }}>{slots.map(at => <div key={at} className="resource-tick" style={{ top: (at - start) / 60000 * scale }}>{DateTime.fromMillis(at, { zone: CLUB_TIME_ZONE }).toFormat('HH:mm')}</div>)}</div></div>
        {resources.map(resource => {
          const rows = entries.filter(e => +new Date(e.startTime) < end && +new Date(e.endTime) > start
            && (grouping === 'trainers' ? e.trainerId === resource.id : grouping === 'horses' ? e.horses.some(h => h.id === resource.id) : e.arenaId === resource.id))
            .sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime) || a.id.localeCompare(b.id))
          const laneEnds: number[] = []
          const placed = rows.map(entry => {
            let lane = laneEnds.findIndex(until => until <= +new Date(entry.startTime))
            if (lane === -1) lane = laneEnds.length
            laneEnds[lane] = +new Date(entry.endTime)
            return { entry, lane }
          })
          const lanes = Math.max(1, laneEnds.length)
          const workload = workloads.find(w => w.horseId === resource.id)
          const arena = arenas.find(a => a.id === resource.id)
          const rests = grouping === 'horses' ? entries.filter(e => e.active && e.horses.some(h => h.id === resource.id)).flatMap(e => {
            const rest = e.horses.find(h => h.id === resource.id)!.restMinutes
            const from = +new Date(e.endTime), to = from + rest * 60000
            return rest > 0 && from < end && to > start ? [{ from, to, rest, id: e.id }] : []
          }) : []
          return <section key={resource.id} className={`resource-column resource-column--${grouping}`} aria-label={resource.name}>
            <header className="resource-header"><strong>{resource.name}</strong>
              {grouping === 'horses' && (workload ? <><span className="resource-data">{Number(workload.currentWorkloadMinutes.toFixed(1))} / {workload.maxDailyWorkloadMinutes} мин</span><Progress size="small" percent={Math.min(100, workload.currentWorkloadMinutes / workload.maxDailyWorkloadMinutes * 100)} showInfo={false} strokeColor="var(--crm-saddle)" /></> : <span>Нагрузка недоступна</span>)}
              {grouping === 'arenas' && <span className="resource-data">Пик за день: {occupancy?.find(a => a.arenaId === resource.id)?.occupied ?? peakOccupancy(rows, start, end)} / {arena?.maxRidersCapacity ?? arena?.capacity ?? '—'} всадников</span>}
            </header>
            <div className="resource-lane" style={{ height }}>
              {slots.map(at => <button key={at} type="button" className="resource-slot" style={{ top: (at - start) / 60000 * scale, height: Math.min(30, (end - at) / 60000) * scale }}
                disabled={!canManage || isDayOff || rests.some(r => r.from < at + 1800000 && r.to > at)}
                aria-label={`Забронировать: ${resource.name}, ${DateTime.fromMillis(at, { zone: CLUB_TIME_ZONE }).toFormat('HH:mm')}`}
                onClick={() => onBook({ startTime: DateTime.fromMillis(at, { zone: CLUB_TIME_ZONE }).toFormat("yyyy-MM-dd'T'HH:mm"), endTime: DateTime.fromMillis(Math.min(at + 1800000, end), { zone: CLUB_TIME_ZONE }).toFormat("yyyy-MM-dd'T'HH:mm"),
                  ...(grouping === 'trainers' ? { trainerId: resource.id } : grouping === 'horses' ? { horseId: resource.id } : { arenaId: resource.id }) })} />)}
              {rests.map(rest => <div key={rest.id} className="resource-rest" style={{ top: (Math.max(start, rest.from) - start) / 60000 * scale, height: (Math.min(end, rest.to) - Math.max(start, rest.from)) / 60000 * scale }} title={`Отдых ${rest.rest} мин, до ${DateTime.fromMillis(rest.to, { zone: CLUB_TIME_ZONE }).toFormat('HH:mm')}`}><span>Отдых {rest.rest} мин</span></div>)}
              {placed.map(({ entry, lane }) => {
                const text = `${clock(entry.startTime)}–${clock(entry.endTime)} · ${entry.horses.map(h => h.name).join(', ') || 'Без лошади'} · ${entry.trainerName} · ${entry.riders.join(', ') || 'Нет участников'} · ${entry.discipline} · ${entryStatusLabel(entry)}`
                return <Tooltip key={entry.id} title={text} trigger={['hover', 'focus']}><button type="button" className={`resource-booking ${entry.completed ? 'resource-booking--completed' : !entry.active ? 'resource-booking--cancelled' : ''}`}
                  style={{ top: (Math.max(start, +new Date(entry.startTime)) - start) / 60000 * scale + 2, height: Math.max(28, (Math.min(end, +new Date(entry.endTime)) - Math.max(start, +new Date(entry.startTime))) / 60000 * scale - 4), left: `${lane / lanes * 100}%`, width: `calc(${100 / lanes}% - 4px)` }}
                  aria-label={text} onClick={() => onOpen(entry)}>
                  <b>{clock(entry.startTime)}–{clock(entry.endTime)}</b><strong>{entry.horses.map(h => h.name).join(', ') || 'Без лошади'}</strong>
                  <span>{entry.trainerName} · {entry.riders.join(', ') || 'Нет участников'}</span><span>{entry.discipline}</span><small>{entryStatusLabel(entry)}</small>
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
