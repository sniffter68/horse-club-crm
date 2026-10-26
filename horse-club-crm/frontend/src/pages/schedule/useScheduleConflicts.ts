import { useEffect, useState } from 'react'
import { API_URL, httpClient, toHttpError } from '../../httpClient'
import { catalog } from '../catalogs/loadCatalog'
import type { Lesson } from './types'
import { scheduleEntries, type ScheduleEntry, type TriadBooking } from './triad'

// Fetch the interval independently of calendar filters and the visible date range.
export function useScheduleConflicts(from?: string, to?: string, excludeId?: string) {
  const key = `${from}|${to}|${excludeId}`
  const enabled = Boolean(from && to && from < to)
  const [state, setState] = useState<{ key: string; entries: ScheduleEntry[]; error?: string }>({ key: '', entries: [] })
  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void Promise.all([
        httpClient.get<Lesson[]>(`${API_URL}/lessons`, { signal: controller.signal, params: { from, to } }),
        catalog<TriadBooking>('bookings', controller.signal, { from, to }),
      ]).then(([lessons, bookings]) => {
        if (!controller.signal.aborted) setState({ key, entries: scheduleEntries(lessons.data, bookings).filter(e => e.id !== excludeId && e.active && +new Date(e.startTime) < +new Date(to!) && +new Date(e.endTime) > +new Date(from!)) })
      }).catch(cause => {
        if (!controller.signal.aborted) setState({ key, entries: [], error: toHttpError(cause).message })
      })
    }, 200)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [enabled, excludeId, from, key, to])
  return enabled && state.key === key ? { ...state, loading: false } : { entries: [], loading: enabled, error: undefined }
}
