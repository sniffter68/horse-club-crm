import { useEffect } from 'react';
import { haptic, telegram, withTelegram } from './telegram';

export function useTelegramNavigation(text: string | undefined, enabled: boolean, busy: boolean,
  action: () => void, back: (() => void) | undefined): void {
  useEffect(() => {
    const app = telegram();
    if (!app?.initData) return;
    const click = () => { if (enabled && !busy) { haptic(); action(); } };
    withTelegram(() => {
      app.MainButton.setParams({ text: text ?? '', is_active: enabled && !busy, is_visible: Boolean(text) });
      if (busy) app.MainButton.showProgress(); else app.MainButton.hideProgress();
      app.MainButton.onClick(click);
    });
    withTelegram(() => {
      if (app.BackButton) {
        if (back) { app.BackButton.show(); app.BackButton.onClick(back); } else app.BackButton.hide();
      }
    });
    return () => {
      withTelegram(() => {
        app.MainButton.offClick(click); app.MainButton.hide(); app.MainButton.hideProgress();
      });
      withTelegram(() => {
        if (app.BackButton) {
          if (back) app.BackButton.offClick(back);
          app.BackButton.hide();
        }
      });
    };
  }, [text, enabled, busy, action, back]);
}
