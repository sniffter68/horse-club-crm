import type { AuthProvider } from '@refinedev/core'
import axios from 'axios'
import { clearSession, getIdentity, getToken, isRole, saveSession } from './authStorage'
import { API_URL, toHttpError } from './httpClient'

export interface LoginCredentials { email: string; password: string }
export const authProvider = {
  login: async ({ email, password }: LoginCredentials) => {
    try {
      const { data } = await axios.post<unknown>(`${API_URL}/auth/login`, { email, password }, { timeout: 15_000 })
      if (!data || typeof data !== 'object' || !('access_token' in data) ||
        typeof data.access_token !== 'string' || !data.access_token.trim() || !('user' in data) ||
        !data.user || typeof data.user !== 'object' || !('email' in data.user) ||
        typeof data.user.email !== 'string' || !data.user.email || !('role' in data.user) || !isRole(data.user.role)) {
        throw new Error('Сервер вернул некорректные данные авторизации')
      }
      saveSession(data.access_token, { email: data.user.email, role: data.user.role })
      return { success: true, redirectTo: '/clients' }
    } catch (error: unknown) {
      clearSession()
      const failure = toHttpError(error)
      return { success: false, error: { name: 'Ошибка входа', message: failure.statusCode === 401 ? 'Неверный email или пароль' : failure.message } }
    }
  },
  logout: async () => {
    clearSession()
    return { success: true, redirectTo: '/login' }
  },
  check: async () => getToken()
    ? { authenticated: true }
    : { authenticated: false, logout: true, redirectTo: '/login' },
  getPermissions: async () => getIdentity()?.role ?? null,
  getIdentity: async () => getIdentity(),
  onError: async (error: unknown) => {
    const failure = toHttpError(error)
    if (failure.statusCode === 401) {
      clearSession()
      return { logout: true, redirectTo: '/login' }
    }
    return { error: failure }
  },
} satisfies AuthProvider
