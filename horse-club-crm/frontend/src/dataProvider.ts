import type { BaseRecord, DataProvider, GetListParams, GetListResponse, Pagination } from '@refinedev/core'
import simpleRestProvider from '@refinedev/simple-rest'
import { API_URL, httpClient } from './httpClient'

type ListParams = Omit<GetListParams, 'pagination'> & { pagination?: Pagination & { current?: number } }
export const dataProvider = {
  ...simpleRestProvider(API_URL, httpClient),
  getList: async <TData extends BaseRecord = BaseRecord>({ resource, pagination, sorters, filters, meta }: ListParams): Promise<GetListResponse<TData>> => {
    const params = new URLSearchParams()
    const currentPage = pagination?.currentPage ?? pagination?.current ?? 1
    const pageSize = pagination?.pageSize ?? 10
    if (!Number.isInteger(currentPage) || currentPage < 1 || !Number.isInteger(pageSize) || pageSize < 1) {
      throw new Error('Номер страницы и размер страницы должны быть положительными целыми числами')
    }
    if ((pagination?.mode ?? 'server') !== 'server') throw new Error('API каталогов поддерживает только серверную пагинацию')
    params.set('_start', String((currentPage - 1) * pageSize))
    params.set('_end', String(currentPage * pageSize))
    if (sorters && sorters.length > 1) throw new Error('API поддерживает сортировку по одному полю')
    const sorter = sorters?.[0]
    if (sorter) {
      params.set('_sort', sorter.field)
      params.set('_order', sorter.order.toUpperCase())
    }
    for (const filter of filters ?? []) {
      if (!('field' in filter) || filter.field !== 'q' || !['eq', 'contains'].includes(filter.operator) || typeof filter.value !== 'string') {
        throw new Error('API каталогов поддерживает только текстовый фильтр q')
      }
      params.set('q', filter.value)
    }
    const { data, headers } = await httpClient.get<TData[]>(`${API_URL}/${resource}?${params}`, { headers: meta?.headers })
    const totalHeader: unknown = headers['x-total-count']
    const total = typeof totalHeader === 'string' && totalHeader.trim() !== '' ? Number(totalHeader) : NaN
    if (!Array.isArray(data) || !Number.isSafeInteger(total) || total < 0) {
      throw new Error('Некорректный ответ API: ожидаются массив данных и заголовок x-total-count')
    }
    return { data, total }
  },
} satisfies DataProvider
