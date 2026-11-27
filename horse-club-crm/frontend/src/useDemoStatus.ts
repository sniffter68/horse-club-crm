import { useEffect, useState } from 'react'
import axios from 'axios'
import { API_URL } from './httpClient'

export type DemoRole = 'OWNER' | 'ADMIN' | 'TRAINER'

export function useDemoStatus(): boolean {
  const [isDemo, setDemo] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    void axios.get<{ isDemo: boolean }>(`${API_URL}/demo/status`, { signal: controller.signal, timeout: 10000 })
      .then(({ data }) => { if (!controller.signal.aborted) setDemo(data.isDemo === true) })
      .catch(() => { /* An unavailable or older backend must never expose demo actions. */ })
    return () => controller.abort()
  }, [])
  return isDemo
}
