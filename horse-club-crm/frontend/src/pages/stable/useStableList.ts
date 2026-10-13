import { useCallback } from 'react'
import { useCustom, type HttpError } from '@refinedev/core'
import { API_URL } from '../../httpClient'

export interface StablePage<T> { data: T[]; total: number; ownerAccount?: { id: string; boardingBalance: string } | null }
export function useStableList<T>(path: string) {
  const { query } = useCustom<StablePage<T>, HttpError>({ url: `${API_URL}/${path}`, method: 'get', errorNotification: false,
    queryOptions: { retry: false, staleTime: 0 } })
  const refresh = useCallback(() => { void query.refetch() }, [query.refetch])
  return { result: query.data?.data, loading: query.isFetching, error: query.error?.message, refresh }
}
