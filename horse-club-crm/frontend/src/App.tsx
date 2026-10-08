import { lazy, Suspense, useEffect, useState } from 'react'
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
import { PricingPlanList } from './pages/pricing-plans/list'
import { PricingPlanCreate } from './pages/pricing-plans/create'
import { PricingPlanEdit } from './pages/pricing-plans/edit'
import { ArenaList } from './pages/arenas/list'
import { ArenaCreate } from './pages/arenas/create'
import { ArenaEdit } from './pages/arenas/edit'
import { HorseHealthLogList } from './pages/horse-health-logs/list'
import { HorseHealthLogCreate } from './pages/horse-health-logs/create'
import { HorseHealthLogEdit } from './pages/horse-health-logs/edit'
import { StallList } from './pages/stalls/list'
import { StallCreate } from './pages/stalls/create'
import { StallEdit } from './pages/stalls/edit'
import { BoardingContractList } from './pages/boarding-contracts/list'
import { BoardingContractCreate } from './pages/boarding-contracts/create'
import { BoardingContractEdit } from './pages/boarding-contracts/edit'
import { PaymentList } from './pages/payments/list'
import { Authenticated, Refine, usePermissions, type ResourceProps } from '@refinedev/core'
import { ThemedLayout as ThemedLayoutV2, ThemedTitle as ThemedTitleV2, useNotificationProvider } from '@refinedev/antd'
import routerProvider, { CatchAllNavigate } from '@refinedev/react-router'
import { App as AntdApp, ConfigProvider, Result, Spin, theme as antdTheme } from 'antd'
import ruRU from 'antd/locale/ru_RU'
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { authProvider } from './authProvider'
import { dataProvider } from './dataProvider'
import { LoginPage } from './pages/login'
import { Sidebar } from './components/layout/Sidebar'
import { DashboardPage } from './pages/dashboard'
import { LessonHistoryPage } from './pages/lesson-history'
import type { Role } from './authStorage'
import '@refinedev/antd/dist/reset.css'

const catalogs = [
  { name: 'clients', ListPage: ClientList, CreatePage: ClientCreate, EditPage: ClientEdit, label: 'Клиенты' },
  { name: 'horses', ListPage: HorseList, CreatePage: HorseCreate, EditPage: HorseEdit, label: 'Лошади' },
  { name: 'trainers', ListPage: TrainerList, CreatePage: TrainerCreate, EditPage: TrainerEdit, label: 'Тренеры' },
  { name: 'services', ListPage: ServiceList, CreatePage: ServiceCreate, EditPage: ServiceEdit, label: 'Услуги' },
  { name: 'arenas', ListPage: ArenaList, CreatePage: ArenaCreate, EditPage: ArenaEdit, label: 'Манежи' },
  { name: 'horse-health-logs', ListPage: HorseHealthLogList, CreatePage: HorseHealthLogCreate, EditPage: HorseHealthLogEdit, label: 'Журнал здоровья' },
  { name: 'stalls', ListPage: StallList, CreatePage: StallCreate, EditPage: StallEdit, label: 'Денники' },
  { name: 'boarding-contracts', ListPage: BoardingContractList, CreatePage: BoardingContractCreate, EditPage: BoardingContractEdit, label: 'Договоры постоя' },
] as const
const SchedulePage = lazy(() => import('./pages/schedule').then(module => ({ default: module.SchedulePage })))
const THEME_STORAGE_KEY = 'horsecrm.color_mode'
const resources: ResourceProps[] = [
  { name: 'dashboard', list: '/', meta: { label: 'Дашборд' } },
  { name: 'lessons', list: '/schedule', meta: { label: 'Расписание' } },
  { name: 'lesson-history', list: '/lesson-history', meta: { label: 'Журнал занятий' } },
  ...catalogs.map(({ name, label }) => ({ name, list: `/${name}`, create: `/${name}/new`, edit: `/${name}/edit/:id`, meta: { label } })),
  { name: 'settings', list: '/settings', meta: { label: 'Настройки' } },
  { name: 'memberships', list: '/memberships', create: '/memberships/new', meta: { label: 'Абонементы' } },
  { name: 'pricing-plans', list: '/pricing-plans', create: '/pricing-plans/new', edit: '/pricing-plans/edit/:id', meta: { label: 'Тарифы' } },
  { name: 'users', list: '/users', create: '/users/new', meta: { label: 'Пользователи' } },
  { name: 'payments', list: '/payments', meta: { label: 'Оплаты' } },
]
function LoadingPage() {
  return <div className="loading-page"><Spin size="large" aria-label="Загрузка" /></div>
}
function DashboardRoute() {
  const { data: role, isLoading } = usePermissions<Role>({})
  if (isLoading) return <LoadingPage />
  if (role === 'TRAINER') return <Navigate to="/schedule" replace />
  return <DashboardPage />
}
export default function App() {
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem(THEME_STORAGE_KEY) === 'dark')
  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? 'dark' : 'light'
    document.documentElement.style.colorScheme = darkMode ? 'dark' : 'light'
  }, [darkMode])
  const toggleTheme = () => setDarkMode(current => {
    const next = !current
    localStorage.setItem(THEME_STORAGE_KEY, next ? 'dark' : 'light')
    return next
  })

  const quietLuxuryTheme = {
    algorithm: darkMode ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token: {
      colorPrimary: '#241E1C',
      colorPrimaryHover: '#724C39',
      colorPrimaryActive: '#3A2F2B',
      colorLink: '#724C39',
      colorLinkHover: '#3A2F2B',
      colorInfo: '#724C39',
      colorSuccess: '#3E5F48',
      colorWarning: '#8C6527',
      colorError: '#8C3838',
      colorText: darkMode ? '#FAF7F2' : '#3A2F2B',
      colorTextSecondary: darkMode ? '#CBBFB6' : '#71645E',
      colorBgLayout: darkMode ? '#181311' : '#F7F4F0',
      colorBgContainer: darkMode ? '#241E1C' : '#FFFFFF',
      colorBgElevated: darkMode ? '#2D2522' : '#FFFFFF',
      colorBorder: darkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.10)',
      colorBorderSecondary: darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
      borderRadius: 12,
      borderRadiusLG: 24,
      borderRadiusSM: 10,
      fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontFamilyCode: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
      controlHeight: 40,
      controlOutline: 'rgba(114, 76, 57, 0.22)',
      boxShadowSecondary: '0 18px 48px rgba(58, 47, 43, 0.10)',
    },
    components: {
      Button: {
        primaryShadow: '0 8px 20px rgba(36, 30, 28, 0.16)',
        defaultBg: darkMode ? '#2D2522' : '#FFFFFF',
        defaultBorderColor: darkMode ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.10)',
        defaultColor: darkMode ? '#FAF7F2' : '#3A2F2B',
        borderRadius: 12,
      },
      Card: { borderRadiusLG: 24 },
      Layout: {
        bodyBg: darkMode ? '#181311' : '#F7F4F0',
        headerBg: darkMode ? '#181311' : '#F7F4F0',
        siderBg: '#241E1C',
      },
      Table: {
        headerBg: darkMode ? '#2D2522' : '#F3EFEA',
        headerColor: darkMode ? '#FAF7F2' : '#3A2F2B',
        rowHoverBg: darkMode ? '#302724' : '#FAF8F5',
        borderColor: darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
      },
      Drawer: { colorBgElevated: '#241E1C' },
      Menu: {
        darkItemBg: '#241E1C',
        darkSubMenuItemBg: '#1D1817',
        darkItemColor: '#FAF7F2',
        darkItemSelectedBg: 'rgba(255,255,255,0.15)',
        darkItemSelectedColor: '#E4DAD0',
        darkItemHoverBg: 'rgba(255,255,255,0.09)',
        darkItemHoverColor: '#FFFFFF',
      },
    },
  }

  return (
    <BrowserRouter>
      <ConfigProvider locale={ruRU} theme={quietLuxuryTheme}>
        <AntdApp>
          <Refine dataProvider={dataProvider} authProvider={authProvider} routerProvider={routerProvider}
            notificationProvider={useNotificationProvider} resources={resources}
            options={{ syncWithLocation: true, disableTelemetry: true }}>
            <Routes>
              <Route element={<Authenticated key="private" fallback={<CatchAllNavigate to="/login" />} loading={<LoadingPage />}>
                <ThemedLayoutV2 Sider={() => <Sidebar darkMode={darkMode} onToggleTheme={toggleTheme} />} Title={(props) => <ThemedTitleV2 {...props} text="Horse CRM" />}><Outlet /></ThemedLayoutV2>
              </Authenticated>}>
                <Route index element={<DashboardRoute />} />
                {catalogs.map(({ name, ListPage, CreatePage, EditPage }) => (
                  <Route key={name} path={name}>
                    <Route index element={<ListPage />} />
                    <Route path="new" element={<CreatePage />} />
                    <Route path="edit/:id" element={<EditPage />} />
                  </Route>
                ))}
                <Route path="schedule" element={<Suspense fallback={<LoadingPage />}><SchedulePage /></Suspense>} />
                <Route path="lesson-history" element={<LessonHistoryPage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="memberships"><Route index element={<MembershipList />} /><Route path="new" element={<MembershipCreate />} /></Route>
                <Route path="pricing-plans"><Route index element={<PricingPlanList />} /><Route path="new" element={<PricingPlanCreate />} /><Route path="edit/:id" element={<PricingPlanEdit />} /></Route>
                <Route path="users"><Route index element={<UserList />} /><Route path="new" element={<UserCreate />} /></Route>
                <Route path="payments" element={<PaymentList />} />
                <Route path="*" element={<Result status="404" title="404" subTitle="Страница не найдена" />} />
              </Route>
              <Route element={<Authenticated key="public" fallback={<Outlet />} loading={<LoadingPage />}><Navigate to="/" replace /></Authenticated>}>
                <Route path="login" element={<LoginPage />} />
              </Route>
            </Routes>
          </Refine>
        </AntdApp>
      </ConfigProvider>
    </BrowserRouter>
  )
}
