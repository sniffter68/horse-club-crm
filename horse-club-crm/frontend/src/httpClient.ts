import axios from 'axios'
import type { HttpError } from '@refinedev/core'

export const API_URL = (import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '')
export const httpClient = axios.create({ timeout: 15_000 })
export interface ApiError extends HttpError { code?: string; details?: Record<string, unknown> }
httpClient.interceptors.request.use((config) => {
  config.headers.delete('Authorization')
  return config
})
export function toHttpError(error: unknown): ApiError {
  if (axios.isAxiosError<unknown>(error)) {
    const body = error.response?.data
    const message = body && typeof body === 'object' && 'message' in body ? body.message : undefined
    const detail = typeof message === 'string' ? message
      : Array.isArray(message) && message.every((item) => typeof item === 'string') ? message.join('. ')
      : error.response ? 'Не удалось выполнить запрос' : 'Сервер недоступен. Проверьте подключение.'
    const extra = body && typeof body === 'object' ? body : {}
    return Object.assign(new Error(detail), { statusCode: error.response?.status ?? 0,
      ...('code' in extra && typeof extra.code === 'string' ? { code: extra.code } : {}),
      ...('details' in extra && extra.details && typeof extra.details === 'object' && !Array.isArray(extra.details) ? { details: extra.details as Record<string, unknown> } : {}),
    })
  }
  if (error && typeof error === 'object' && 'statusCode' in error && typeof error.statusCode === 'number') {
    const message = 'message' in error && typeof error.message === 'string' ? error.message : 'Ошибка запроса'
    return Object.assign(new Error(message), { statusCode: error.statusCode,
      ...('code' in error && typeof error.code === 'string' ? { code: error.code } : {}),
      ...('details' in error && error.details && typeof error.details === 'object' && !Array.isArray(error.details) ? { details: error.details as Record<string, unknown> } : {}),
    })
  }
  return Object.assign(error instanceof Error ? error : new Error('Неизвестная ошибка'), { statusCode: 0 })
}
httpClient.interceptors.response.use((response) => response, (error: unknown) => Promise.reject(toHttpError(error)))
