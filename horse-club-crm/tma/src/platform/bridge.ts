import vkBridge from '@vkontakte/vk-bridge';
import { waitForTelegram, telegramRequiredError } from '../telegram';
import { apiOrigin, type BootstrapResponse } from '../api';

export const isVk = (): boolean => {
  const params = new URLSearchParams(window.location.search);
  return (params.has('vk_user_id') && params.has('sign')) || window.location.pathname.startsWith('/vk-app');
};
let initialized: Promise<unknown> | undefined;
export async function initPlatform(): Promise<void> {
  if (!isVk()) return;
  initialized ??= vkBridge.send('VKWebAppInit').then(() => {
    vkBridge.subscribe(event => {
      if (event.detail.type !== 'VKWebAppUpdateConfig') return;
      const dark = event.detail.data.appearance === 'dark';
      document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
      document.documentElement.style.setProperty('--tma-bg', dark ? '#1c2420' : '#f3f6f3');
      document.documentElement.style.setProperty('--tma-text', dark ? '#edf2ed' : '#163326');
      document.documentElement.style.setProperty('--tma-surface', dark ? '#28332c' : '#ffffff');
      document.documentElement.style.setProperty('--tma-hint', dark ? '#b3bdb6' : '#526358');
    });
  });
  await Promise.race([initialized, new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Откройте приложение через VK')), 10000);
  })]);
}
type VkResult = { status: 'UNLINKED'; vkUserId: string } | { status: 'LINKED'; role: 'CLIENT' | 'ADMIN' | 'TRAINER' | 'MANAGER' | 'STABLE_WORKER' | 'GROOM' | 'VET' | 'OTHER'; access_token: string; token: string; clientId?: string; trainerId: string | null; accessLevel: 'FULL' | 'READ_ONLY'; user: { id: string; name: string } };
export async function copyVkId(vkUserId: string): Promise<void> {
  await vkBridge.send('VKWebAppCopyText', { text: vkUserId });
}

export async function linkVkPhone(): Promise<BootstrapResponse> {
  let contact: { phone_number: string; sign: string };
  try { contact = await vkBridge.send('VKWebAppGetPhoneNumber'); }
  catch { throw new Error('VK не передал номер. Разрешите доступ к номеру или передайте VK ID администратору.'); }
  return vkAuthenticate({ phone: contact.phone_number, phoneToken: contact.sign });
}

export async function vkAuthenticate(contact?: { phone: string; phoneToken: string }): Promise<BootstrapResponse> {
  const origin = apiOrigin();
  const response = await fetch(`${origin}/api/auth/vk-mini-app${contact ? '/link-by-vk' : ''}`, {
    method: 'POST', credentials: 'include', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ launchParams: window.location.search, ...contact }),
    signal: AbortSignal.timeout(15000),
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
}
export async function bootstrapPlatform(signal: AbortSignal, telegramBootstrap: (initData: string) => Promise<BootstrapResponse>): Promise<BootstrapResponse> {
  if (isVk()) { await initPlatform(); signal.throwIfAborted(); return vkAuthenticate(); }
  const app = await waitForTelegram(signal);
  signal.throwIfAborted();
  if (!app?.initData) throw telegramRequiredError();
  return telegramBootstrap(app.initData);
}
