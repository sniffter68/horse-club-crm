export interface TelegramUser { id: number; first_name: string; last_name?: string; username?: string }
export interface TelegramContact { phone_number: string; first_name: string; last_name?: string; user_id?: number }
export interface TelegramContactResponse { responseUnsafe?: { contact?: TelegramContact } }
interface TelegramButton {
  show(): void; hide(): void;
  onClick(callback: () => void): void; offClick(callback: () => void): void;
}
export interface TelegramWebApp {
  safeAreaInset?: { top: number; bottom: number; left: number; right: number };
  contentSafeAreaInset?: { top: number; bottom: number; left: number; right: number };
  initData: string;
  initDataUnsafe: { user?: TelegramUser };
  themeParams: { bg_color?: string; text_color?: string; button_color?: string; button_text_color?: string; hint_color?: string; secondary_bg_color?: string };
  MainButton: TelegramButton & { setParams(params: { text: string; is_active: boolean; is_visible: boolean }): void; showProgress(): void; hideProgress(): void };
  BackButton?: TelegramButton;
  HapticFeedback?: { impactOccurred(style: 'light'): void };
  isVersionAtLeast?(version: string): boolean;
  requestContact?(callback: (ok: boolean, response?: TelegramContactResponse) => void): void;
  ready(): void; expand(): void;
  enableClosingConfirmation(): void; disableClosingConfirmation(): void;
  onEvent(event: 'themeChanged' | 'safeAreaChanged' | 'contentSafeAreaChanged', callback: () => void): void;
  offEvent(event: 'themeChanged' | 'safeAreaChanged' | 'contentSafeAreaChanged', callback: () => void): void;
}
declare global { interface Window { Telegram?: { WebApp: TelegramWebApp } } }
export const telegram = (): TelegramWebApp | undefined => typeof window !== 'undefined' ? window.Telegram?.WebApp : undefined;

// Native bridge methods may exist but throw on older Telegram clients.
export function withTelegram(action: (app: TelegramWebApp) => void): void {
  try {
    const app = telegram();
    if (app) action(app);
  } catch (error) {
    console.warn(error);
  }
}

export const haptic = (): void => withTelegram(app => app.HapticFeedback?.impactOccurred('light'));

export function canRequestContact(app: TelegramWebApp | undefined): boolean {
  try {
    return typeof app?.requestContact === 'function'
      && (typeof app.isVersionAtLeast !== 'function' || app.isVersionAtLeast('6.9'));
  } catch {
    return false;
  }
}

export function applyTheme(): void {
  const app = telegram();
  document.documentElement.style.colorScheme = 'dark';
  const top = Math.max(20, app?.safeAreaInset?.top ?? 0, app?.contentSafeAreaInset?.top ?? 0);
  document.documentElement.style.setProperty('--tma-safe-top', `${top}px`);
  document.documentElement.style.setProperty('--tma-safe-bottom', `${Math.max(0, app?.safeAreaInset?.bottom ?? 0, app?.contentSafeAreaInset?.bottom ?? 0)}px`);
}

export async function waitForTelegram(signal: AbortSignal): Promise<TelegramWebApp | undefined> {
  const deadline = Date.now() + 2000;
  while (!signal.aborted && Date.now() < deadline) {
    if (telegram()?.initData) return telegram();
    await new Promise<void>(resolve => window.setTimeout(resolve, 50));
  }
  return telegram();
}
