import type { ReactNode } from 'react'
import { Layout } from 'antd'
import { Sidebar } from './Sidebar'

export function AppLayout({ children, header, darkMode, onToggleTheme }: {
  children: ReactNode; header: ReactNode; darkMode: boolean; onToggleTheme: () => void
}) {
  return <Layout className="crm-app-layout" hasSider>
    <Sidebar darkMode={darkMode} onToggleTheme={onToggleTheme} />
    <Layout className="crm-workspace">
      {header}
      <main className="crm-main">{children}</main>
    </Layout>
  </Layout>
}
