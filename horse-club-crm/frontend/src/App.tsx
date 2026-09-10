import { lazy, Suspense } from 'react'
import { SettingsPage } from './pages/settings'
import { ClientList } from './pages/clients/list'
import { ClientCreate } from './pages/clients/create'
import { ClientEdit } from './pages/clients/edit'
import { HorseList } from './pages/horses/list'
import { HorseCreate } from './pages/horses/create'
import { HorseEdit } from './pages/horses/edit'
import { TrainerList } from './pages/trainers/list'
import { TrainerCreate } from './pages/trainers/create'
import { TrainerEdit } from './pages/trainers/edit'
import { ServiceList } from './pages/services/list'
import { ServiceCreate } from './pages/services/create'
import { ServiceEdit } from './pages/services/edit'
import { UserList } from './pages/users/list'
import { UserCreate } from './pages/users/create'
import { MembershipList } from './pages/memberships/list'
import { MembershipCreate } from './pages/memberships/create'
import { Authenticated, Refine, type ResourceProps } from '@refinedev/core'
import { ThemedLayout as ThemedLayoutV2, ThemedTitle as ThemedTitleV2, useNotificationProvider } from '@refinedev/antd'
import routerProvider, { CatchAllNavigate } from '@refinedev/react-router'
import { App as AntdApp, ConfigProvider, Result, Spin } from 'antd'
import ruRU from 'antd/locale/ru_RU'
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { authProvider } from './authProvider'
import { dataProvider } from './dataProvider'
import { LoginPage } from './pages/login'
import { Sidebar } from './components/layout/Sidebar'
import '@refinedev/antd/dist/reset.css'

const catalogs = [
  { name: 'clients', ListPage: ClientList, CreatePage: ClientCreate, EditPage: ClientEdit, label: 'Клиенты' },
  { name: 'horses', ListPage: HorseList, CreatePage: HorseCreate, EditPage: HorseEdit, label: 'Лошади' },
  { name: 'trainers', ListPage: TrainerList, CreatePage: TrainerCreate, EditPage: TrainerEdit, label: 'Тренеры' },
  { name: 'services', ListPage: ServiceList, CreatePage: ServiceCreate, EditPage: ServiceEdit, label: 'Услуги' },
] as const
const SchedulePage = lazy(() => import('./pages/schedule').then(module => ({ default: module.SchedulePage })))
const resources: ResourceProps[] = [
  ...catalogs.map(({ name, label }) => ({ name, list: `/${name}`, create: `/${name}/new`, edit: `/${name}/edit/:id`, meta: { label } })),
  { name: 'lessons', list: '/schedule', meta: { label: 'Расписание' } },
  { name: 'settings', list: '/settings', meta: { label: 'Настройки' } },
  { name: 'memberships', list: '/memberships', create: '/memberships/new', meta: { label: 'Абонементы' } },
  { name: 'users', list: '/users', create: '/users/new', meta: { label: 'Пользователи' } },
]
function LoadingPage() {
  return <div className="loading-page"><Spin size="large" aria-label="Загрузка" /></div>
}
export default function App() {
  return (
    <BrowserRouter>
      <ConfigProvider locale={ruRU}>
        <AntdApp>
          <Refine dataProvider={dataProvider} authProvider={authProvider} routerProvider={routerProvider}
            notificationProvider={useNotificationProvider} resources={resources}
            options={{ syncWithLocation: true, disableTelemetry: true }}>
            <Routes>
              <Route element={<Authenticated key="private" fallback={<CatchAllNavigate to="/login" />} loading={<LoadingPage />}>
                <ThemedLayoutV2 Sider={() => <Sidebar />} Title={(props) => <ThemedTitleV2 {...props} text="Horse CRM" />}><Outlet /></ThemedLayoutV2>
              </Authenticated>}>
                <Route index element={<Navigate to="/clients" replace />} />
                {catalogs.map(({ name, ListPage, CreatePage, EditPage }) => (
                  <Route key={name} path={name}>
                    <Route index element={<ListPage />} />
                    <Route path="new" element={<CreatePage />} />
                    <Route path="edit/:id" element={<EditPage />} />
                  </Route>
                ))}
                <Route path="schedule" element={<Suspense fallback={<LoadingPage />}><SchedulePage /></Suspense>} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="memberships"><Route index element={<MembershipList />} /><Route path="new" element={<MembershipCreate />} /></Route>
                <Route path="users"><Route index element={<UserList />} /><Route path="new" element={<UserCreate />} /></Route>
                <Route path="*" element={<Result status="404" title="404" subTitle="Страница не найдена" />} />
              </Route>
              <Route element={<Authenticated key="public" fallback={<Outlet />} loading={<LoadingPage />}><Navigate to="/clients" replace /></Authenticated>}>
                <Route path="login" element={<LoginPage />} />
              </Route>
            </Routes>
          </Refine>
        </AntdApp>
      </ConfigProvider>
    </BrowserRouter>
  )
}
