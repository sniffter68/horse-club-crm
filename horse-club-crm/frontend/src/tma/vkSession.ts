import { getApiBaseUrl } from '../apiUrl'
import { TmaApiError, type TmaBootstrapResponse } from './api'

export const isVkMiniApp = () => window.location.pathname.startsWith('/vk-app/')

export async function vkStaffBootstrap(signal: AbortSignal): Promise<TmaBootstrapResponse> {
  const response = await fetch(`${getApiBaseUrl()}/auth/vk-mini-app`, {
    method: 'POST', credentials: 'include', cache: 'no-store',
    signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ launchParams: window.location.search }),
  })
  const result = await response.json()
  if (!response.ok) throw new TmaApiError(typeof result.message === 'string' ? result.message : 'Не удалось войти через VK', response.status)
  if (result.status === 'UNLINKED' || result.role === 'CLIENT') {
    window.location.replace(`/vk-app/${window.location.search}${window.location.hash}`)
    throw new Error('Открываем кабинет клиента…')
  }
  if (!result.token || !['ADMIN', 'TRAINER', 'STAFF'].includes(result.miniAppRole)
    || !['FULL', 'READ_ONLY'].includes(result.accessLevel) || !result.user?.id || !result.user?.name) {
    throw new Error('Не удалось определить кабинет. Повторите вход через VK')
  }
  return { ...result, role: result.miniAppRole }
}
