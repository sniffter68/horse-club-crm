import { useCallback } from 'react'
import { useCustom, type HttpError } from '@refinedev/core'
import { API_URL } from '../../httpClient'
import { stableListQuery } from './pagination'
import { canRequestStableList } from './horseId'

export interface StablePage<T> { data: T[]; total: number; ownerAccount?: { id: string; boardingBalance: string } | null }
export function useStableList<T>(path: string, { enabled = true, horseIdRequired = false }: { enabled?: boolean; horseIdRequired?: boolean } = {}) {
  // simple-rest custom appends its own "?". An already serialized URL corrupts
  // the last query value (offset=0?, horseId=<uuid>? or type=shoeing?).
  const separator = path.indexOf('?')
  const resource = separator < 0 ? path : path.slice(0, separator)
  const params = new URLSearchParams(separator < 0 ? '' : path.slice(separator + 1))
  const canRequest = enabled && canRequestStableList(params, horseIdRequired)
  const { query } = useCustom<StablePage<T>, HttpError>({ url: `${API_URL}/${resource}`, method: 'get', errorNotification: false,
    config: { query: stableListQuery(Object.fromEntries(params)) },
    queryOptions: { enabled: canRequest, retry: false, staleTime: 0 } })
  const { refetch } = query
  const refresh = useCallback(() => { if (canRequest) void refetch() }, [canRequest, refetch])
  return { result: canRequest ? query.data?.data : undefined, loading: canRequest && query.isFetching, error: canRequest ? query.error?.message : undefined, refresh }
}
