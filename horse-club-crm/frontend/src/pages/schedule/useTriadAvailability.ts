import { useEffect, useState } from 'react'
import { API_URL, httpClient, toHttpError } from '../../httpClient'
import type { TriadAvailability } from './triad'

export function useTriadAvailability(from: string | undefined, to: string | undefined, revision: number, report: (cause: unknown) => void, excludeBookingId?: string) {
  const key = `${from ?? ''}|${to ?? ''}|${revision}|${excludeBookingId ?? ''}`
  const enabled = Boolean(from && to)
  const [state, setState] = useState<{ key: string; data?: TriadAvailability; loading: boolean; error?: string }>({ key: '', loading: false })
  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      if (!enabled) return
      setState({ key, loading: true })
      void httpClient.get<TriadAvailability>(`${API_URL}/bookings/availability`, { signal: controller.signal, params: { from, to, excludeBookingId } })
        .then(response => {
          if (!Array.isArray(response.data.horseWorkloads) || !Array.isArray(response.data.arenaOccupancy)) throw new Error('Не удалось прочитать доступность ресурсов')
          if (!controller.signal.aborted) setState({ key, data: response.data, loading: false })
        }).catch(cause => {
          if (controller.signal.aborted) return
          const failure = toHttpError(cause)
          setState({ key, loading: false, error: failure.message })
          if (failure.statusCode === 401) report(cause)
        })
    }, 200)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [enabled, excludeBookingId, from, key, report, to])
  return enabled && state.key === key ? state : { key, loading: enabled }
}
