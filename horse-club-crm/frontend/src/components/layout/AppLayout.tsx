import type { ReactNode } from 'react'
import { Layout } from 'antd'
import { Sidebar } from './Sidebar'
import { usePermissions } from '@refinedev/core'
import { Navigate, useLocation } from 'react-router-dom'
import type { Role } from '../../authStorage'

export function AppLayout({ children, header, darkMode, onToggleTheme }: {
  children: ReactNode; header: ReactNode; darkMode: boolean; onToggleTheme: () => void
}) {
  const { data: role, isLoading } = usePermissions<Role>({})
  const location = useLocation()
  if (isLoading) return null
  if (role === 'TRAINER') return location.pathname === '/trainer' ? <>{children}</> : <Navigate to="/trainer" replace />
  return <Layout className="crm-app-layout" hasSider>
    <Sidebar darkMode={darkMode} onToggleTheme={onToggleTheme} />
    <Layout className="crm-workspace">
      {header}
      <main className="crm-main">{children}</main>
    </Layout>
  </Layout>
}
