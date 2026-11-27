import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { App as ClientApp } from '../../../tma/src/App'
import { bootstrapPlatform } from '../../../tma/src/platform/bridge'
import type { BootstrapResponse } from '../../../tma/src/api'
import { withDeadline } from '../../../tma/src/deadline'
import type { TrainerSession } from './api'

const StaffApp = lazy(() => withDeadline(() => import('./TrainerScheduleView'), undefined, 15000)
  .then(module => ({ default: module.TrainerScheduleView })))

function Failure({ message, retry }: { message: string; retry: () => void }) {
  return <main className="mx-auto max-w-xl px-5"><div role="alert">
    <h1>Не удалось открыть кабинет</h1><p>{message}</p>
    <button className="primary mt-4" onClick={retry}>Повторить</button>
  </div></main>
}

export class MiniAppBoundary extends Component<{ children: ReactNode; retry: () => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    return this.state.failed
      ? <Failure message="Не удалось показать кабинет. Повторите попытку." retry={this.props.retry} />
      : this.props.children
  }
}

type State = { kind: 'loading' } | { kind: 'ready'; result: BootstrapResponse } | { kind: 'error'; message: string }
const hasLaunch = () => {
  const params = new URLSearchParams(window.location.search)
  return Boolean(params.get('vk_app_id') && params.get('vk_user_id') && params.get('sign'))
}

/** One document, one signed bootstrap, an in-memory session shared with the chosen cabinet. */
export function VkMiniApp() {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<State>({ kind: 'loading' })
  const outside = !hasLaunch()
  const retry = () => { setState({ kind: 'loading' }); setAttempt(value => value + 1) }
  useEffect(() => {
    const expire = () => setState({ kind: 'error', message: 'Сессия истекла. Повторите вход через VK' })
    window.addEventListener('vk:session-expired', expire)
    return () => window.removeEventListener('vk:session-expired', expire)
  }, [])
  useEffect(() => {
    if (outside) return
    const controller = new AbortController()
    void bootstrapPlatform(controller.signal, async () => { throw new Error('Откройте приложение через VK') })
      .then(result => { if (!controller.signal.aborted) setState({ kind: 'ready', result }) })
      .catch((error: unknown) => { if (!controller.signal.aborted) setState({ kind: 'error', message: error instanceof Error ? error.message : 'Проверьте соединение и повторите попытку' }) })
    return () => controller.abort()
  }, [outside, attempt])
  if (outside) return <main className="mx-auto max-w-xl px-5"><h1>Откройте приложение через VK</h1><a href="https://vk.ru/app54927434" target="_blank" rel="noreferrer">Открыть в VK</a></main>
  if (state.kind === 'loading') return <main className="mx-auto max-w-xl px-5"><p role="status">Загружаем личный кабинет…</p></main>
  if (state.kind === 'error') return <Failure message={state.message} retry={retry} />
  const result = state.result
  let session: TrainerSession | undefined
  if (result.role !== 'CLIENT' && result.role !== 'UNLINKED_CLIENT') {
    session = { authenticated: true, role: result.role, access_token: result.token, accessLevel: result.accessLevel,
      trainer: { trainerId: result.trainerId ?? '', name: result.user.name } }
  }
  return <MiniAppBoundary key={attempt} retry={() => window.location.reload()}><Suspense fallback={<p role="status">Загружаем расписание…</p>}>
    {session ? <StaffApp session={session} onRetry={retry} /> : <ClientApp bootstrap={result} onBootstrap={next => {
      if (next.role === 'UNLINKED_CLIENT') retry()
      else setState({ kind: 'ready', result: next })
    }} />}
  </Suspense></MiniAppBoundary>
}
