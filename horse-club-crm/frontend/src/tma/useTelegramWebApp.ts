export type { TelegramWebApp } from '../../../tma/src/telegram'
import '../../../tma/src/telegram'
import { useCallback, useEffect, useState } from 'react'
import { tmaRequest, type TmaBootstrapResponse, type TrainerSession } from './api'
import { isVkMiniApp } from './vkSession'

const trainerColors = { bg: '#1c2420', text: '#edf2ed', surface: '#28332c', hint: '#b3bdb6', button: '#a4d5b8', 'button-text': '#163326' }
function syncTrainerTheme() {
  document.documentElement.dataset.theme = 'dark'
  for (const [key, value] of Object.entries(trainerColors)) document.documentElement.style.setProperty(`--trainer-${key}`, value)
}

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

export function useTelegramWebApp(suppliedSession?: TrainerSession) {
  const [state, setState] = useState<AuthState>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [dark, setDark] = useState(true)
  useEffect(() => {
    document.title = 'Кабинет клуба · Horse Club'
    const controller = new AbortController()
    let disposeTheme: (() => void) | undefined
    void (async () => {
      try {
        if (suppliedSession) {
          const previousTheme = document.documentElement.dataset.theme
          syncTrainerTheme()
          disposeTheme = () => {
            if (previousTheme) document.documentElement.dataset.theme = previousTheme
            else delete document.documentElement.dataset.theme
            for (const key of Object.keys(trainerColors)) document.documentElement.style.removeProperty(`--trainer-${key}`)
          }
          setState({ kind: 'ready', session: suppliedSession }); return
        }
        await loadTelegramSdk()
        if (controller.signal.aborted) return
        const app = window.Telegram?.WebApp
        // WebView may install the bridge before signed launch data becomes available.
        if (app && !app.initData) await new Promise<void>(resolve => {
          const deadline = Date.now() + 1500;
          const poll = () => { if (controller.signal.aborted || app.initData || Date.now() >= deadline) resolve(); else window.setTimeout(poll, 50) };
          poll();
        });
        if (!app || !app.initData) { setState({ kind: 'outside' }); return }
        app.ready()
        app.expand()
        const root = document.documentElement
        const previousTheme = root.dataset.theme
        const syncSafeArea = () => {
          for (const [name, inset] of [['safe', app.safeAreaInset], ['content-safe', app.contentSafeAreaInset]] as const) {
            for (const edge of ['top', 'bottom', 'left', 'right'] as const) {
              const value = inset?.[edge]
              const property = `--trainer-${name}-area-inset-${edge}`
              if (typeof value === 'number' && Number.isFinite(value) && value >= 0) root.style.setProperty(property, `${value}px`)
              else root.style.removeProperty(property)
            }
          }
        }
        const syncTheme = () => {
          setDark(true)
          syncTrainerTheme()
        }
        syncTheme()
        syncSafeArea()
        app.onEvent('themeChanged', syncTheme)
        app.onEvent('safeAreaChanged', syncSafeArea)
        app.onEvent('contentSafeAreaChanged', syncSafeArea)
        disposeTheme = () => {
          app.offEvent('themeChanged', syncTheme)
          app.offEvent('safeAreaChanged', syncSafeArea)
          app.offEvent('contentSafeAreaChanged', syncSafeArea)
          for (const name of ['safe', 'content-safe']) for (const edge of ['top', 'bottom', 'left', 'right']) root.style.removeProperty(`--trainer-${name}-area-inset-${edge}`)
          if (previousTheme) root.dataset.theme = previousTheme
          else delete root.dataset.theme
          for (const key of ['bg', 'text', 'surface', 'hint', 'button', 'button-text']) root.style.removeProperty(`--trainer-${key}`)
        }
        const result = await tmaRequest<TmaBootstrapResponse>('bootstrap', null, { method: 'POST',
          body: JSON.stringify({ initData: app.initData }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]) })
        if (controller.signal.aborted) return
        if (result.role === 'CLIENT' || result.role === 'UNLINKED_CLIENT') {
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
  }, [attempt, suppliedSession])
  const retry = useCallback(() => { setState({ kind: 'loading' }); setAttempt(value => value + 1) }, [])
  const expire = useCallback(() => setState({ kind: 'error', message: isVkMiniApp() ? 'Сессия истекла. Повторите вход через VK' : 'Сессия истекла. Откройте приложение заново через бота' }), [])
  return { state, dark, retry, expire }
}
