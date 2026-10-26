import { useEffect, useRef } from 'react'
import type { ScheduleEntry } from './triad'
import { eventSummary, eventTime, eventTrainer } from './scheduleEventPresentation'

export function ScheduleEventContent({ entry }: { entry: ScheduleEntry }) {
  const ref = useRef<HTMLDivElement>(null)
  const summary = eventSummary(entry)
  useEffect(() => {
    // FullCalendar owns the clickable element; keep its tooltip/name current after updates.
    const event = ref.current?.closest<HTMLElement>('.fc-event')
    if (event) { event.title = summary; event.setAttribute('aria-label', summary) }
  }, [summary])
  return <div ref={ref} className="schedule-event-content" title={summary}>
    <div className="schedule-event-time">{eventTime(entry)}</div>
    <div className="schedule-event-trainer">{eventTrainer(entry)}</div>
    <div className="schedule-event-rider">{entry.riders.join(', ') || 'Нет участников'}</div>
    <div className="schedule-event-horse">{entry.horses.map(horse => horse.name).join(', ') || 'Без лошади'}</div>
    {entry.paymentSummary && <div className="schedule-event-payment"><span>{entry.paymentSummary}</span></div>}
  </div>
}
