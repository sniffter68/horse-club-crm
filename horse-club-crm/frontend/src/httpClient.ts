import axios from 'axios'
import type { HttpError } from '@refinedev/core'
import { getToken } from './authStorage'

export const API_URL = (import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '')
export const httpClient = axios.create({ timeout: 15_000 })
httpClient.interceptors.request.use((config) => {
  const token = getToken()
  if (token) config.headers.set('Authorization', `Bearer ${token}`)
  else config.headers.delete('Authorization')
  return config
})
export function toHttpError(error: unknown): HttpError {
  if (axios.isAxiosError<unknown>(error)) {
    const body = error.response?.data
    const message = body && typeof body === 'object' && 'message' in body ? body.message : undefined
    const detail = typeof message === 'string' ? message
      : Array.isArray(message) && message.every((item) => typeof item === 'string') ? message.join('. ')
      : error.response ? 'Не удалось выполнить запрос' : 'Сервер недоступен. Проверьте подключение.'
    return Object.assign(new Error(detail), { statusCode: error.response?.status ?? 0 })
  }
  if (error && typeof error === 'object' && 'statusCode' in error && typeof error.statusCode === 'number') {
    const message = 'message' in error && typeof error.message === 'string' ? error.message : 'Ошибка запроса'
    return Object.assign(new Error(message), { statusCode: error.statusCode })
  }
  return Object.assign(error instanceof Error ? error : new Error('Неизвестная ошибка'), { statusCode: 0 })
}
httpClient.interceptors.response.use((response) => response, (error: unknown) => Promise.reject(toHttpError(error)))
