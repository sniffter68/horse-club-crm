export interface TelegramUser { id: number; first_name: string; last_name?: string; username?: string }
export interface TelegramContact { phone_number: string; first_name: string; last_name?: string; user_id?: number }
export interface TelegramContactResponse { responseUnsafe?: { contact?: TelegramContact } }
interface TelegramButton {
  show(): void; hide(): void;
  onClick(callback: () => void): void; offClick(callback: () => void): void;
}
export interface TelegramWebApp {
  initData: string;
  initDataUnsafe: { user?: TelegramUser };
  themeParams: { bg_color?: string; text_color?: string; button_color?: string; button_text_color?: string; hint_color?: string; secondary_bg_color?: string };
  MainButton: TelegramButton & { setParams(params: { text: string; is_active: boolean; is_visible: boolean }): void; showProgress(): void; hideProgress(): void };
  BackButton: TelegramButton;
  HapticFeedback?: { impactOccurred(style: 'light'): void };
  isVersionAtLeast?(version: string): boolean;
  requestContact?(callback: (ok: boolean, response?: TelegramContactResponse) => void): void;
  ready(): void; expand(): void;
  enableClosingConfirmation(): void; disableClosingConfirmation(): void;
  onEvent(event: 'themeChanged', callback: () => void): void;
  offEvent(event: 'themeChanged', callback: () => void): void;
}
declare global { interface Window { Telegram?: { WebApp: TelegramWebApp } } }
export const telegram = (): TelegramWebApp | undefined => window.Telegram?.WebApp;
export const haptic = (): void => telegram()?.HapticFeedback?.impactOccurred('light');

export function applyTheme(): void {
  const theme = telegram()?.themeParams;
  const tokens = { bg: theme?.bg_color, text: theme?.text_color, button: theme?.button_color,
    'button-text': theme?.button_text_color, hint: theme?.hint_color, surface: theme?.secondary_bg_color };
  for (const [key, value] of Object.entries(tokens)) {
    if (value && /^#[\da-f]{6}$/i.test(value)) document.documentElement.style.setProperty(`--tma-${key}`, value);
  }
}
