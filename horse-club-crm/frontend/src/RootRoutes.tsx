import { lazy, Suspense } from 'react'

const TrainerTma = lazy(() => import('./tma/TmaRootGateway').then(module => ({ default: module.TmaRootGateway })))
const CrmApp = lazy(() => import('./App'))

export function RootRoutes() {
  return <Suspense fallback={<p role="status">Загрузка…</p>}>
    {/^\/tma(?:\/trainer)?\/?$/.test(window.location.pathname) ? <TrainerTma /> : <CrmApp />}
  </Suspense>
}
