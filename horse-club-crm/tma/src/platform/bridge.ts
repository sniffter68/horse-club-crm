import { withDeadline } from '../deadline';
import vkBridge from '@vkontakte/vk-bridge';
import { waitForTelegram, telegramRequiredError } from '../telegram';
import { apiOrigin, type BootstrapResponse } from '../api';

export const isVk = (): boolean => {
  const params = new URLSearchParams(window.location.search);
  return (params.has('vk_user_id') && params.has('sign')) || window.location.pathname.startsWith('/vk-app');
};
let initialized: Promise<unknown> | undefined;
export async function initPlatform(signal?: AbortSignal): Promise<void> {
  if (!isVk()) return;
  initialized ??= withDeadline(() => vkBridge.send('VKWebAppInit'), undefined, 10000).then(() => {
    vkBridge.subscribe(event => {
      if (event.detail.type !== 'VKWebAppUpdateConfig') return;
      const dark = event.detail.data.appearance === 'dark';
      document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
      document.documentElement.style.setProperty('--tma-bg', dark ? '#1c2420' : '#f3f6f3');
      document.documentElement.style.setProperty('--tma-text', dark ? '#edf2ed' : '#163326');
      document.documentElement.style.setProperty('--tma-surface', dark ? '#28332c' : '#ffffff');
      document.documentElement.style.setProperty('--tma-hint', dark ? '#b3bdb6' : '#526358');
    });
  }).catch((error: unknown) => { initialized = undefined; throw error; });
  await withDeadline(() => initialized!, signal, 10000);
}

type VkResult = { status: 'UNLINKED'; vkUserId: string } | { status: 'LINKED'; role: 'CLIENT' | 'ADMIN' | 'TRAINER' | 'MANAGER' | 'STABLE_WORKER' | 'GROOM' | 'VET' | 'OTHER'; access_token: string; token: string; clientId?: string; trainerId: string | null; accessLevel: 'FULL' | 'READ_ONLY'; user: { id: string; name: string } };
export async function copyVkId(vkUserId: string): Promise<void> {
  await withDeadline(() => vkBridge.send('VKWebAppCopyText', { text: vkUserId }), undefined, 10000);
}

export async function linkVkPhone(): Promise<BootstrapResponse> {
  let contact: { phone_number: string; sign: string };
  try { contact = await withDeadline(() => vkBridge.send('VKWebAppGetPhoneNumber'), undefined, 15000); }
  catch { throw new Error('VK не передал номер. Разрешите доступ к номеру или передайте VK ID администратору.'); }
  return vkAuthenticate({ phone: contact.phone_number, phoneToken: contact.sign });
}

export async function vkAuthenticate(contact?: { phone: string; phoneToken: string }, parent?: AbortSignal): Promise<BootstrapResponse> {
  const origin = apiOrigin();
  return withDeadline(async signal => {
    const response = await fetch(`${origin}/api/auth/vk-mini-app${contact ? '/link-by-vk' : ''}`, {
      method: 'POST', credentials: 'include', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ launchParams: window.location.search, ...contact }),
      signal,
    });
    if (!response.ok) {
      const failure: unknown = await response.json().catch(() => null);
      const message = failure && typeof failure === 'object' && 'message' in failure && typeof failure.message === 'string' ? failure.message : '';
      throw new Error(message || 'Не удалось войти. Повторите вход через VK или обратитесь к администратору.');
    }
    const result = await response.json() as VkResult;
    if (result.status === 'UNLINKED') return { role: 'UNLINKED_CLIENT', needsPhoneLink: true, vkUserId: result.vkUserId };
    if (result.role !== 'CLIENT') {
      return { role: result.role === 'ADMIN' || result.role === 'TRAINER' ? result.role : 'STAFF',
        token: result.token, trainerId: result.trainerId, accessLevel: result.accessLevel, user: result.user };
    }
    return { role: 'CLIENT', token: result.token ?? result.access_token, clientId: result.clientId ?? null, clientName: null, activeMembership: null, nextLesson: null };
  }, parent, 15000);
}
export async function bootstrapPlatform(signal: AbortSignal, telegramBootstrap: (initData: string) => Promise<BootstrapResponse>): Promise<BootstrapResponse> {
  if (isVk()) {
    const params = new URLSearchParams(window.location.search);
    if (!params.get('vk_app_id') || !params.get('sign') || !params.get('vk_user_id')) throw new Error('Откройте приложение через VK');
    await initPlatform(signal); signal.throwIfAborted(); return vkAuthenticate(undefined, signal);
  }
  const app = await waitForTelegram(signal);
  signal.throwIfAborted();
  if (!app?.initData) throw telegramRequiredError();
  return telegramBootstrap(app.initData);
}
