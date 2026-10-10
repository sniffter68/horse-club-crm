import { API_URL, httpClient } from '../../httpClient'

export async function catalog<T>(resource: string, signal: AbortSignal, params: Record<string, string | undefined> = {}): Promise<T[]> {
  const records: T[] = []
  for (let start = 0; ; start += 100) {
    const response = await httpClient.get<T[]>(`${API_URL}/${resource}`, { signal, params: { ...params, _start: start, _end: start + 100 } })
    if (!Array.isArray(response.data)) throw new Error('Не удалось прочитать справочник')
    records.push(...response.data)
    if (response.data.length < 100 || records.length >= Number(response.headers['x-total-count'])) return records
  }
}
