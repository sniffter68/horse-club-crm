import vkBridge from '@vkontakte/vk-bridge';
import { waitForTelegram, telegramRequiredError } from '../telegram';
import type { BootstrapResponse } from '../api';

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
type VkResult = { status: 'UNLINKED'; vkUserId: string } | { status: 'LINKED'; role: 'CLIENT' | 'ADMIN' | 'TRAINER'; access_token: string; clientId?: string };
export async function vkAuthenticate(phone?: string, code?: string): Promise<BootstrapResponse> {
  const origin = window.location.hostname === 'horseclub68.ru' ? 'https://crm.horseclub68.ru' : '';
  const response = await fetch(`${origin}/api/auth/vk-mini-app${phone ? '/link' : ''}`, {
    method: 'POST', credentials: 'include', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ launchParams: window.location.search, ...(phone ? { phone, code } : {}) }),
  });
  if (!response.ok) throw new Error('Не удалось войти. Проверьте код или откройте приложение заново через VK.');
  const result = await response.json() as VkResult;
  if (result.status === 'UNLINKED') return { role: 'UNLINKED_CLIENT', needsPhoneLink: true };
  if (result.role !== 'CLIENT') {
    return { role: result.role };
  }
  return { role: 'CLIENT', token: result.access_token, clientId: result.clientId ?? null, clientName: null, activeMembership: null, nextLesson: null };
}
export async function bootstrapPlatform(signal: AbortSignal, telegramBootstrap: (initData: string) => Promise<BootstrapResponse>): Promise<BootstrapResponse> {
  if (isVk()) { await initPlatform(); signal.throwIfAborted(); return vkAuthenticate(); }
  const app = await waitForTelegram(signal);
  signal.throwIfAborted();
  if (!app?.initData) throw telegramRequiredError();
  return telegramBootstrap(app.initData);
}
