import { useEffect, useState } from 'react'
import { quickRequest, type QuickPermissions } from './quickTrainerBooking'

export function useQuickBookingPermissions(token?: string) {
  const [state, setState] = useState<{ token: string; permissions: QuickPermissions }>()
  useEffect(() => {
    if (!token) return
    const controller = new AbortController()
    void quickRequest<QuickPermissions>('permissions', token, controller.signal).then(permissions => {
      if (!controller.signal.aborted) setState({ token, permissions })
    }).catch(() => { /* Fail closed; schedule remains usable. */ })
    return () => controller.abort()
  }, [token])
  return state?.token === token ? state?.permissions : undefined
}
