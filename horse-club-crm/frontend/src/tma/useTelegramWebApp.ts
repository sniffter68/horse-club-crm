import { useCallback, useEffect, useState } from 'react'
import { tmaRequest, type TmaBootstrapResponse, type TrainerSession } from './api'

export interface TelegramWebApp {
  initData: string
  colorScheme: 'light' | 'dark'
  themeParams: { bg_color?: string; text_color?: string; secondary_bg_color?: string; hint_color?: string; button_color?: string; button_text_color?: string }
  ready(): void
  expand(): void
  onEvent(event: 'themeChanged', callback: () => void): void
  offEvent(event: 'themeChanged', callback: () => void): void
}
declare global { interface Window { Telegram?: { WebApp?: TelegramWebApp } } }

let sdkPromise: Promise<void> | undefined
function loadTelegramSdk(): Promise<void> {
  if (window.Telegram?.WebApp) return Promise.resolve()
  if (!sdkPromise) sdkPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://telegram.org/js/telegram-web-app.js'
    script.async = true
    const timeout = window.setTimeout(() => { script.remove(); reject(new Error('Telegram не ответил. Откройте приложение заново')) }, 15000)
    script.onload = () => { window.clearTimeout(timeout); resolve() }
    script.onerror = () => { window.clearTimeout(timeout); script.remove(); reject(new Error('Не удалось загрузить Telegram. Проверьте соединение')) }
    document.head.append(script)
  }).catch((error: unknown) => { sdkPromise = undefined; throw error })
  return sdkPromise
}

type AuthState = { kind: 'loading' } | { kind: 'ready'; session: TrainerSession }
  | { kind: 'not-linked' } | { kind: 'outside' } | { kind: 'error'; message: string }

export function useTelegramWebApp() {
  const [state, setState] = useState<AuthState>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [dark, setDark] = useState(false)
  useEffect(() => {
    document.title = 'Кабинет клуба · Horse Club'
    const controller = new AbortController()
    let disposeTheme: (() => void) | undefined
    void (async () => {
      try {
        await loadTelegramSdk()
        if (controller.signal.aborted) return
        const app = window.Telegram?.WebApp
        if (!app || !app.initData) { setState({ kind: 'outside' }); return }
        app.ready()
        app.expand()
        const root = document.documentElement
        const previousTheme = root.dataset.theme
        const syncTheme = () => {
          setDark(app.colorScheme === 'dark')
          root.dataset.theme = app.colorScheme
          const values = { bg: app.themeParams.bg_color, text: app.themeParams.text_color,
            surface: app.themeParams.secondary_bg_color, hint: app.themeParams.hint_color,
            button: app.themeParams.button_color, 'button-text': app.themeParams.button_text_color }
          for (const [key, value] of Object.entries(values)) {
            if (value && /^#[0-9a-f]{6}$/i.test(value)) root.style.setProperty(`--trainer-${key}`, value)
            else root.style.removeProperty(`--trainer-${key}`)
          }
        }
        syncTheme()
        app.onEvent('themeChanged', syncTheme)
        disposeTheme = () => {
          app.offEvent('themeChanged', syncTheme)
          if (previousTheme) root.dataset.theme = previousTheme
          else delete root.dataset.theme
          for (const key of ['bg', 'text', 'surface', 'hint', 'button', 'button-text']) root.style.removeProperty(`--trainer-${key}`)
        }
        const result = await tmaRequest<TmaBootstrapResponse>('bootstrap', null, { method: 'POST',
          body: JSON.stringify({ initData: app.initData }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]) })
        if (controller.signal.aborted) return
        if (result.role === 'CLIENT') {
          if (/^\/tma\/trainer\/?$/.test(window.location.pathname)) { setState({ kind: 'not-linked' }); return }
          // Preserve Telegram's signed launch parameters across the separate client bundle.
          window.location.replace(`/tma/client${window.location.search}${window.location.hash}`)
          return
        }
        setState({ kind: 'ready', session: { authenticated: true, role: result.role, access_token: result.token,
          accessLevel: result.accessLevel, trainer: { trainerId: result.trainerId ?? '', name: result.user.name } } })
      } catch (error: unknown) {
        if (!controller.signal.aborted) setState({ kind: 'error', message: error instanceof Error ? error.message : 'Не удалось войти' })
      }
    })()
    return () => { controller.abort(); disposeTheme?.() }
  }, [attempt])
  const retry = useCallback(() => { setState({ kind: 'loading' }); setAttempt(value => value + 1) }, [])
  const expire = useCallback(() => setState({ kind: 'error', message: 'Сессия истекла. Откройте приложение заново через бота' }), [])
  return { state, dark, retry, expire }
}
