import { useEffect, useState } from 'react'
import { API_URL, httpClient, toHttpError } from '../../httpClient'
import type { DailyHorseWorkload } from './types'

type WorkloadState = { key: string; byDate: Record<string, DailyHorseWorkload[]>; error?: string; loading: boolean }

export function useHorseWorkloads(dates: string[], revision: number, report: (cause: unknown) => void, excludeLessonId?: string): WorkloadState {
  const datesKey = [...new Set(dates.filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date)))].sort().join('|')
  const key = `${datesKey}:${revision}:${excludeLessonId ?? ''}`
  const [state, setState] = useState<WorkloadState>({ key: '', byDate: {}, loading: false })
  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      await Promise.resolve()
      if (controller.signal.aborted) return
      setState({ key, byDate: {}, loading: Boolean(datesKey) })
      if (!datesKey) return
      try {
        const entries = await Promise.all(datesKey.split('|').map(async date => {
          const response = await httpClient.get<DailyHorseWorkload[]>(`${API_URL}/horses/workload`, {
            signal: controller.signal, params: { date, excludeLessonId },
          })
          if (!Array.isArray(response.data)) throw new Error('Сервер вернул некорректную нагрузку лошадей')
          return [date, response.data] as const
        }))
        if (!controller.signal.aborted) setState({ key, byDate: Object.fromEntries(entries), loading: false })
      } catch (cause) {
        if (controller.signal.aborted) return
        const failure = toHttpError(cause)
        setState({ key, byDate: {}, loading: false, error: failure.message })
        if (failure.statusCode === 401) report(cause)
      }
    }
    void load()
    return () => controller.abort()
  }, [datesKey, excludeLessonId, key, report])
  return state.key === key ? state : { key, byDate: {}, loading: Boolean(datesKey) }
}
