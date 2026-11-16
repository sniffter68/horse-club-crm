import { useCallback, useEffect, useState } from 'react'
import { API_URL, httpClient, toHttpError } from '../../httpClient'
import { tmaRequest } from '../../tma/api'

export function useWorkspace<T>(path: string, tmaToken?: string) {
  const [result, setResult] = useState<{ key: string; data?: T; error?: string }>()
  const [revision, setRevision] = useState(0)
  const key = `${path}:${revision}:${tmaToken ?? 'crm'}`
  const refresh = useCallback(() => setRevision(value => value + 1), [])
  useEffect(() => {
    const controller = new AbortController()
    const request = tmaToken ? tmaRequest<T>(`workspace/${path}`, tmaToken, { signal: controller.signal })
      : httpClient.get<T>(`${API_URL}/workspace/${path}`, { signal: controller.signal }).then(result => result.data)
    void request.then(result => {
      if (!controller.signal.aborted) setResult({ key, data: result })
    }).catch((cause: unknown) => { if (!controller.signal.aborted) setResult({ key, error: toHttpError(cause).message }) })
    return () => controller.abort()
  }, [path, key, tmaToken])
  return { data: result?.key === key ? result.data : undefined, error: result?.key === key ? result.error : undefined, loading: result?.key !== key, refresh }
}
