import { useState } from 'react'
import { useLogout, useMenu, usePermissions, type TreeMenuItem } from '@refinedev/core'
import type { Role } from '../../authStorage'
import { ThemedTitle } from '@refinedev/antd'
import {
  BulbOutlined,
  CalendarOutlined,
  CreditCardOutlined,
  HomeOutlined,
  LogoutOutlined,
  MenuOutlined,
  MoonOutlined,
  SettingOutlined,
  TeamOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons'
import { Button, Drawer, Grid, Layout, Menu, type MenuProps } from 'antd'
import { Link } from 'react-router-dom'

function toMenuItems(resources: TreeMenuItem[]): NonNullable<MenuProps['items']> {
  return resources.map((item) => ({
    key: item.key,
    icon: item.icon ?? <UnorderedListOutlined />,
    label: item.route ? <Link to={item.route}>{item.label}</Link> : item.label,
    ...(item.children.length ? { children: toMenuItems(item.children) } : {}),
  }))
}

const menuCategories = [
  { key: 'category-lessons', label: 'Занятия', icon: <CalendarOutlined />, resources: ['lessons', 'lesson-history'] },
  { key: 'category-clients', label: 'Клиенты и финансы', icon: <CreditCardOutlined />, resources: ['clients', 'memberships', 'pricing-plans', 'payments'] },
  { key: 'category-horses', label: 'Лошади и постой', icon: <HomeOutlined />, resources: ['horses', 'horse-health-logs', 'stalls', 'boarding-contracts'] },
  { key: 'category-club', label: 'Клуб и команда', icon: <TeamOutlined />, resources: ['trainers', 'services', 'arenas'] },
  { key: 'category-admin', label: 'Администрирование', icon: <SettingOutlined />, resources: ['users', 'settings'] },
] as const

const categorizedResourceNames = new Set<string>(menuCategories.flatMap(category => [...category.resources]))

function toCategorizedMenuItems(resources: TreeMenuItem[]): NonNullable<MenuProps['items']> {
  const result: NonNullable<MenuProps['items']> = []

  for (const category of menuCategories) {
    const categoryResources = resources.filter(item => category.resources.some(resourceName => resourceName === item.name))
    if (categoryResources.length) {
      result.push({ key: category.key, icon: category.icon, label: category.label, children: toMenuItems(categoryResources) })
    }
  }

  return result
}

export function Sidebar({ darkMode, onToggleTheme }: { darkMode: boolean; onToggleTheme: () => void }) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const screens = Grid.useBreakpoint()
  const { menuItems, selectedKey, defaultOpenKeys } = useMenu()
  const { mutate: logout, isPending } = useLogout()
  const { data: role } = usePermissions<Role>({})
  const visibleMenuItems = menuItems.filter(item =>
    (item.name !== 'settings' || role === 'ADMIN' || role === 'MANAGER') &&
    (item.name !== 'users' || role === 'ADMIN') &&
    (item.name !== 'memberships' || role !== 'TRAINER') &&
    (item.name !== 'pricing-plans' || role !== 'TRAINER') &&
    (item.name !== 'payments' || role !== 'TRAINER') &&
    (item.name !== 'dashboard' || role !== 'TRAINER'),
  )
  const dashboardItems = visibleMenuItems.filter(item => item.name === 'dashboard')
  const uncategorizedItems = visibleMenuItems.filter(item => item.name !== 'dashboard' && !categorizedResourceNames.has(item.name))
  const items: MenuProps['items'] = [
    ...toMenuItems(dashboardItems),
    ...toCategorizedMenuItems(visibleMenuItems),
    ...toMenuItems(uncategorizedItems),
    { key: 'logout', icon: <LogoutOutlined />, label: 'Выход', disabled: isPending, onClick: () => logout() },
  ]
  const selectedResource = visibleMenuItems.find(item => item.key === selectedKey || item.name === selectedKey)
  const selectedCategory = menuCategories.find(category =>
    category.resources.some(resourceName => resourceName === selectedResource?.name),
  )
  const initialOpenKeys = selectedCategory
    ? [...new Set([...defaultOpenKeys, selectedCategory.key])]
    : defaultOpenKeys
  if (!screens.lg) {
    return <>
      <Button
        className="mobile-menu-button"
        type="primary"
        shape="round"
        size="large"
        icon={<MenuOutlined />}
        aria-label="Открыть меню навигации"
        onClick={() => setMobileOpen(true)}
      >
        Меню
      </Button>
      <Drawer
        className="mobile-navigation-drawer"
        placement="left"
        width="min(86vw, 340px)"
        title={<div className="sidebar-title-row">
          <ThemedTitle collapsed={false} text="Horse CRM" />
          <Button type="text" shape="circle" icon={darkMode ? <BulbOutlined /> : <MoonOutlined />}
            aria-label={darkMode ? 'Включить светлую тему' : 'Включить тёмную тему'} onClick={onToggleTheme} />
        </div>}
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        styles={{ body: { padding: 0 } }}
      >
        <Menu theme={darkMode ? 'dark' : 'light'} mode="inline" items={items} selectedKeys={[selectedKey]} defaultOpenKeys={initialOpenKeys}
          onClick={() => setMobileOpen(false)} />
      </Drawer>
    </>
  }

  return (
    <Layout.Sider className="crm-sidebar" theme={darkMode ? 'dark' : 'light'} collapsible collapsed={collapsed} onCollapse={setCollapsed}
      breakpoint="lg" collapsedWidth={80} style={{ minHeight: '100vh' }}>
      <div className="sidebar-title-row sidebar-title-row--desktop">
        <ThemedTitle collapsed={collapsed} text="Horse CRM" />
        <Button type="text" shape="circle" icon={darkMode ? <BulbOutlined /> : <MoonOutlined />}
          aria-label={darkMode ? 'Включить светлую тему' : 'Включить тёмную тему'} onClick={onToggleTheme} />
      </div>
      <Menu theme={darkMode ? 'dark' : 'light'} mode="inline" items={items} selectedKeys={[selectedKey]} defaultOpenKeys={initialOpenKeys} style={{ flex: 1, overflowY: 'auto' }} />
    </Layout.Sider>
  )
}
