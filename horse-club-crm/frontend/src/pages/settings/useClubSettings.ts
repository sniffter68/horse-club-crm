import { useEffect, useRef, useState } from 'react'
import { useOnError } from '@refinedev/core'
import { App } from 'antd'
import { API_URL, httpClient, toHttpError } from '../../httpClient'

export function useClubSettings<T extends object>(endpoint: string, success: string) {
  const [value, setValue] = useState<T>()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const [revision, setRevision] = useState(0)
  const busy = useRef(false)
  const { message } = App.useApp()
  const { mutate: onError } = useOnError()
  const errorHandler = useRef(onError)
  useEffect(() => { errorHandler.current = onError }, [onError])
  useEffect(() => {
    const controller = new AbortController()
    httpClient.get<T>(`${API_URL}/settings/${endpoint}`, { signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setValue(data) })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        const failure = toHttpError(cause)
        setError(failure.message)
        if (failure.statusCode === 401) errorHandler.current(failure)
      }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [endpoint, revision])
  async function save(payload: Partial<T>) {
    if (busy.current || !value) return
    busy.current = true; setSaving(true); setError(undefined)
    try {
      const { data } = await httpClient.patch<T>(`${API_URL}/settings/${endpoint}`, payload)
      setValue(data); void message.success(success)
    } catch (cause: unknown) {
      const failure = toHttpError(cause)
      setError(failure.message)
      if (failure.statusCode === 401) errorHandler.current(failure)
    } finally { busy.current = false; setSaving(false) }
  }
  return { value, loading, saving, error, save, retry: () => { setLoading(true); setError(undefined); setRevision(revision => revision + 1) } }
}
