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
    expect(post).toHaveBeenCalledWith('/api/auth/login', { email: identity.email, password: 'test-password' }, { timeout: 15_000, withCredentials: true })
    expect(getToken()).toBe('cookie-session')
    expect(await authProvider.getIdentity()).toEqual(identity)
    expect(await authProvider.getPermissions()).toBe('ADMIN')
    expect(await authProvider.check()).toEqual({ authenticated: true })
  })
  it('rejects malformed login responses and preserves a previous session', async () => {
    saveSession('old-token', identity)
    vi.spyOn(axios, 'post').mockResolvedValue({ data: { access_token: 'new-token', user: { ...identity, role: 'INVALID' } } })
    expect(await authProvider.login({ email: identity.email, password: 'test' })).toMatchObject({ success: false })
    expect(getToken()).toBe('cookie-session')
  })
  it('logs out without deleting unrelated application storage', async () => {
    httpClient.defaults.adapter = async config => response(config, { success: true })
    localStorage.setItem('preference', 'dark')
    saveSession('test-token', identity)
    expect(await authProvider.logout()).toEqual({ success: true, redirectTo: '/login' })
    expect(await authProvider.check()).toMatchObject({ authenticated: false, redirectTo: '/login' })
    expect(await authProvider.getIdentity()).toBeNull()
    expect(localStorage.getItem('preference')).toBe('dark')
  })
  it('preserves authentication on 401 and 403', async () => {
    saveSession('test-token', identity)
    expect(await authProvider.onError({ statusCode: 403, message: 'Forbidden' })).not.toHaveProperty('logout')
    expect(getToken()).toBe('cookie-session')
    expect(await authProvider.onError({ statusCode: 401 })).not.toHaveProperty('logout')
    expect(getToken()).toBe('cookie-session')
  })
})
describe('Data provider', () => {
  it('serializes and clears archive filters while retaining the catalogue allowlist', async () => {
    httpClient.defaults.adapter = async config => {
      const params = new URL(config.url ?? '', 'http://localhost').searchParams
      expect(params.get('archivedOnly')).toBe('true')
      expect(params.has('includeArchived')).toBe(false)
      return response(config, [])
    }
    await dataProvider.getList({ resource: 'clients', filters: [
      { field: 'archivedOnly', operator: 'eq', value: 'true' },
      { field: 'includeArchived', operator: 'eq', value: undefined },
    ] })
    await expect(dataProvider.getList({ resource: 'clients', filters: [{ field: 'archivedOnly', operator: 'eq', value: 'yes' }] })).rejects.toThrow()
    await expect(dataProvider.getList({ resource: 'horses', filters: [{ field: 'archivedOnly', operator: 'eq', value: true }] })).rejects.toThrow()
  })
  it('sends and clears client type filters without weakening other resource contracts', async () => {
    httpClient.defaults.adapter = async config => {
      expect(new URL(config.url ?? '', 'http://localhost').searchParams.get('clientType')).toBe('ONE_TIME')
      return response(config, [])
    }
    await dataProvider.getList({ resource: 'clients', filters: [{ field: 'clientType', operator: 'eq', value: 'ONE_TIME' }] })
    httpClient.defaults.adapter = async config => {
      expect(new URL(config.url ?? '', 'http://localhost').searchParams.has('clientType')).toBe(false)
      return response(config, [])
    }
    await dataProvider.getList({ resource: 'clients', filters: [{ field: 'clientType', operator: 'eq', value: undefined }] })
    await expect(dataProvider.getList({ resource: 'clients', filters: [{ field: 'clientType', operator: 'eq', value: 'WRONG' }] })).rejects.toThrow()
    await expect(dataProvider.getList({ resource: 'horses', filters: [{ field: 'clientType', operator: 'eq', value: 'ONE_TIME' }] })).rejects.toThrow()
  })
  it('maps pagination, sorting and Unicode search to the backend contract', async () => {
    saveSession('first', identity)
    httpClient.defaults.adapter = async (config) => {
      expect(config.headers.get('Authorization')).toBeUndefined()
      const url = new URL(config.url ?? '', 'http://localhost')
      expect(Object.fromEntries(url.searchParams)).toEqual({ _start: '20', _end: '40', _sort: 'email', _order: 'DESC', q: 'Анна & Иван' })
      return response(config, [{ id: '1' }])
    }
    expect(await dataProvider.getList({ resource: 'clients', pagination: { currentPage: 2, pageSize: 20 }, sorters: [{ field: 'email', order: 'desc' }], filters: [{ field: 'q', operator: 'contains', value: 'Анна & Иван' }] })).toEqual({ data: [{ id: '1' }], total: 51 })
  })
  it('supports legacy current pagination and reads the token for every request', async () => {
    httpClient.defaults.adapter = async (config) => {
      expect(config.headers.get('Authorization')).toBeUndefined()
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
    vi.spyOn(axios, 'post').mockRejectedValue({ statusCode: 401, message: 'Session revoked' })
    httpClient.defaults.adapter = async (config) => {
      throw new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, undefined, response(config, { message: 'Unauthorized' }, 401))
    }
    const error: unknown = await dataProvider.getList({ resource: 'trainers' }).catch((failure: unknown) => failure)
    expect(error).toMatchObject({ statusCode: 401 })
    expect(await authProvider.onError(error)).not.toHaveProperty('logout')
    expect(getToken()).toBe('cookie-session')
  })
})


describe('Silent refresh', () => {
  it('shares refresh across concurrent 401 requests and retries each once', async () => {
    saveSession('cookie-session', identity)
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: { access_token: 'cookie-session' } })
    httpClient.defaults.adapter = async config => {
      if (!(config as typeof config & { sessionRetried?: boolean }).sessionRetried) {
        throw new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, undefined, response(config, {}, 401))
      }
      return response(config, { ok: true })
    }
    const results = await Promise.all([httpClient.get('/api/clients'), httpClient.get('/api/horses')])
    expect(results.every(result => result.data.ok)).toBe(true)
    expect(post).toHaveBeenCalledTimes(1)
    expect(getToken()).toBe('cookie-session')
  })
  it('does not loop when the retried request remains unauthorized', async () => {
    saveSession('cookie-session', identity)
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: {} })
    const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => {
      throw new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, undefined, response(config, {}, 401))
    })
    httpClient.defaults.adapter = adapter
    await expect(httpClient.get('/api/clients')).rejects.toMatchObject({ statusCode: 401 })
    expect(post).toHaveBeenCalledTimes(1)
    expect(adapter).toHaveBeenCalledTimes(2)
    expect(getToken()).toBe('cookie-session')
  })
})
