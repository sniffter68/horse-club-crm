import { lazy, Suspense } from 'react'

const TrainerTma = lazy(() => import('./tma/TrainerScheduleView').then(module => ({ default: module.TrainerScheduleView })))
const CrmApp = lazy(() => import('./App'))

export function RootRoutes() {
  return <Suspense fallback={<p role="status">Загрузка…</p>}>
    {/^\/tma\/trainer\/?$/.test(window.location.pathname) ? <TrainerTma /> : <CrmApp />}
  </Suspense>
}
