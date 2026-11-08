import { useEffect } from 'react';
import { haptic, telegram } from './telegram';

export function useTelegramNavigation(text: string | undefined, enabled: boolean, busy: boolean,
  action: () => void, back: (() => void) | undefined): void {
  useEffect(() => {
    const app = telegram();
    if (!app?.initData) return;
    const click = () => { if (enabled && !busy) { haptic(); action(); } };
    app.MainButton.setParams({ text: text ?? '', is_active: enabled && !busy, is_visible: Boolean(text) });
    if (busy) app.MainButton.showProgress(); else app.MainButton.hideProgress();
    app.MainButton.onClick(click);
    if (back) { app.BackButton.show(); app.BackButton.onClick(back); } else app.BackButton.hide();
    return () => {
      app.MainButton.offClick(click); app.MainButton.hide(); app.MainButton.hideProgress();
      if (back) app.BackButton.offClick(back);
      app.BackButton.hide();
    };
  }, [text, enabled, busy, action, back]);
}
