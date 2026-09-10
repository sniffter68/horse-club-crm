import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios, { AxiosError, AxiosHeaders, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { authProvider } from './authProvider'
import { getToken, saveSession } from './authStorage'
import { dataProvider } from './dataProvider'
import { httpClient } from './httpClient'

const identity = { email: 'admin@example.com', role: 'ADMIN' as const }
const originalAdapter = httpClient.defaults.adapter
function response(config: InternalAxiosRequestConfig, data: unknown, status = 200): AxiosResponse<unknown> {
  return { config, data, status, statusText: String(status), headers: new AxiosHeaders({ 'x-total-count': '51' }) }
}
beforeEach(() => {
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  httpClient.defaults.adapter = originalAdapter
})
describe('Authentication', () => {
  it('saves the token and identity returned by login', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: { access_token: 'test-token', user: { id: '1', ...identity } } })
    expect(await authProvider.login({ email: identity.email, password: 'test-password' })).toMatchObject({ success: true })
    expect(post).toHaveBeenCalledWith('/api/auth/login', { email: identity.email, password: 'test-password' }, { timeout: 15_000 })
    expect(getToken()).toBe('test-token')
    expect(await authProvider.getIdentity()).toEqual(identity)
    expect(await authProvider.getPermissions()).toBe('ADMIN')
    expect(await authProvider.check()).toEqual({ authenticated: true })
  })
  it('rejects malformed login responses and clears a previous session', async () => {
    saveSession('old-token', identity)
    vi.spyOn(axios, 'post').mockResolvedValue({ data: { access_token: 'new-token', user: { ...identity, role: 'INVALID' } } })
    expect(await authProvider.login({ email: identity.email, password: 'test' })).toMatchObject({ success: false })
    expect(getToken()).toBeNull()
  })
  it('logs out without deleting unrelated application storage', async () => {
    localStorage.setItem('preference', 'dark')
    saveSession('test-token', identity)
    expect(await authProvider.logout()).toEqual({ success: true, redirectTo: '/login' })
    expect(await authProvider.check()).toMatchObject({ authenticated: false, redirectTo: '/login' })
    expect(await authProvider.getIdentity()).toBeNull()
    expect(localStorage.getItem('preference')).toBe('dark')
  })
  it('clears authentication on a Refine 401 but preserves it on 403', async () => {
    saveSession('test-token', identity)
    expect(await authProvider.onError({ statusCode: 403, message: 'Forbidden' })).not.toHaveProperty('logout')
    expect(getToken()).toBe('test-token')
    expect(await authProvider.onError({ statusCode: 401 })).toEqual({ logout: true, redirectTo: '/login' })
    expect(getToken()).toBeNull()
  })
})
describe('Data provider', () => {
  it('maps pagination, sorting and Unicode search to the backend contract', async () => {
    saveSession('first', identity)
    httpClient.defaults.adapter = async (config) => {
      expect(config.headers.get('Authorization')).toBe('Bearer first')
      const url = new URL(config.url ?? '', 'http://localhost')
      expect(Object.fromEntries(url.searchParams)).toEqual({ _start: '20', _end: '40', _sort: 'email', _order: 'DESC', q: 'Анна & Иван' })
      return response(config, [{ id: '1' }])
    }
    expect(await dataProvider.getList({ resource: 'clients', pagination: { currentPage: 2, pageSize: 20 }, sorters: [{ field: 'email', order: 'desc' }], filters: [{ field: 'q', operator: 'contains', value: 'Анна & Иван' }] })).toEqual({ data: [{ id: '1' }], total: 51 })
  })
  it('supports legacy current pagination and reads the token for every request', async () => {
    httpClient.defaults.adapter = async (config) => {
      expect(config.headers.get('Authorization')).toBe(getToken() ? `Bearer ${getToken()}` : undefined)
      expect(config.url).toContain('_start=10&_end=20')
      return response(config, [])
    }
    await dataProvider.getList({ resource: 'horses', pagination: { current: 2, pageSize: 10 } })
    saveSession('second', identity)
    await dataProvider.getList({ resource: 'horses', pagination: { current: 2, pageSize: 10 } })
  })
  it('preserves zero totals and rejects a missing count header', async () => {
    httpClient.defaults.adapter = async (config) => ({ ...response(config, []), headers: new AxiosHeaders({ 'x-total-count': '0' }) })
    expect(await dataProvider.getList({ resource: 'services' })).toEqual({ data: [], total: 0 })
    httpClient.defaults.adapter = async (config) => ({ ...response(config, []), headers: new AxiosHeaders() })
    await expect(dataProvider.getList({ resource: 'services' })).rejects.toThrow('x-total-count')
  })
  it('normalizes an Axios 401 for the Refine authentication handler', async () => {
    saveSession('expired', identity)
    httpClient.defaults.adapter = async (config) => {
      throw new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, undefined, response(config, { message: 'Unauthorized' }, 401))
    }
    const error: unknown = await dataProvider.getList({ resource: 'trainers' }).catch((failure: unknown) => failure)
    expect(error).toMatchObject({ statusCode: 401 })
    expect(await authProvider.onError(error)).toEqual({ logout: true, redirectTo: '/login' })
    expect(getToken()).toBeNull()
  })
})
