import { afterEach, describe, expect, it, vi } from 'vitest'
import { getApiBaseUrl, getMediaUrl } from './apiUrl'

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('API URLs', () => {
  it('uses the CRM origin for VK staff and keeps the web proxy elsewhere', () => {
    vi.stubEnv('VITE_API_URL', '')
    vi.stubGlobal('window', { location: { hostname: 'horseclub68.ru', pathname: '/vk-app/staff/' } })
    expect(getApiBaseUrl()).toBe('https://crm.horseclub68.ru/api')
    vi.stubGlobal('window', { location: { hostname: 'crm.horseclub68.ru', pathname: '/tma/trainer' } })
    expect(getApiBaseUrl()).toBe('/api')
  })
  it.each([undefined, '', '   '])('uses the web proxy for %s', value => {
    vi.stubEnv('VITE_API_URL', value)
    expect(getApiBaseUrl()).toBe('/api')
    expect(getMediaUrl('/uploads/horse.png')).toBe('/uploads/horse.png')
  })
  it('normalizes the mobile API and resolves media at the server root', () => {
    vi.stubEnv('VITE_API_URL', ' https://crm.horseclub68.ru/api/// ')
    expect(getApiBaseUrl()).toBe('https://crm.horseclub68.ru/api')
    expect(getMediaUrl('/uploads/horse.png')).toBe('https://crm.horseclub68.ru/uploads/horse.png')
    expect(getMediaUrl('https://images.example/horse.png')).toBe('https://images.example/horse.png')
    expect(getMediaUrl(null)).toBeUndefined()
    expect(getMediaUrl('javascript:alert(1)')).toBeUndefined()
  })
  it('retains a relative API override', () => {
    vi.stubEnv('VITE_API_URL', '/custom/api/')
    expect(getApiBaseUrl()).toBe('/custom/api')
  })
  it.each(['javascript:alert(1)', '//example.com/api', 'https://user:secret@example.com/api', 'https://example.com/api?token=secret'])('rejects an invalid API root: %s', value => {
    vi.stubEnv('VITE_API_URL', value)
    expect(() => getApiBaseUrl()).toThrow()
  })
})
