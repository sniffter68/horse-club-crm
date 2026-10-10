import { useEffect, useState } from 'react'
import { catalog } from '../catalogs/loadCatalog'
import type { Arena, Horse, Service, Trainer } from '../catalogs/types'
import { toHttpError } from '../../httpClient'

export function useLeadLessonCatalogs(enabled: boolean, revision: number, report: (cause: unknown) => void) {
  const [state, setState] = useState<{ loading: boolean; error?: string; trainers: Trainer[]; horses: Horse[]; arenas: Arena[]; services: Service[] }>(
    { loading: true, trainers: [], horses: [], arenas: [], services: [] })
  useEffect(() => {
    const controller = new AbortController()
    if (enabled) void Promise.resolve().then(async () => {
      if (controller.signal.aborted) return
      setState({ loading: true, trainers: [], horses: [], arenas: [], services: [] })
      const results = await Promise.allSettled([
        catalog<Trainer>('trainers', controller.signal), catalog<Horse>('horses', controller.signal),
        catalog<Arena>('arenas', controller.signal), catalog<Service>('services', controller.signal),
      ])
      if (controller.signal.aborted) return
      const failure = results.find(result => result.status === 'rejected')
      if (failure?.status === 'rejected') {
        const error = toHttpError(failure.reason)
        setState({ loading: false, error: error.message, trainers: [], horses: [], arenas: [], services: [] })
        if (error.statusCode === 401) report(error)
        return
      }
      const [trainers, horses, arenas, services] = results as [PromiseFulfilledResult<Trainer[]>, PromiseFulfilledResult<Horse[]>, PromiseFulfilledResult<Arena[]>, PromiseFulfilledResult<Service[]>]
      setState({ loading: false, trainers: trainers.value.filter(row => row.isActive !== false),
        horses: horses.value.filter(row => !row.isUnavailable && (!row.status || row.status === 'active')),
        arenas: arenas.value.filter(row => row.isActive !== false && !row.isUnavailable), services: services.value })
    })
    return () => controller.abort()
  }, [enabled, revision, report])
  return state
}
