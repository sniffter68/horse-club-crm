import { useState } from 'react'
import { useLogout, useMenu, usePermissions, type TreeMenuItem } from '@refinedev/core'
import type { Role } from '../../authStorage'
import { ThemedTitle } from '@refinedev/antd'
import { LogoutOutlined, MenuOutlined, UnorderedListOutlined } from '@ant-design/icons'
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

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const screens = Grid.useBreakpoint()
  const { menuItems, selectedKey, defaultOpenKeys } = useMenu()
  const { mutate: logout, isPending } = useLogout()
  const { data: role } = usePermissions<Role>({})
  const items: MenuProps['items'] = [
    ...toMenuItems(menuItems.filter(item =>
      (item.name !== 'settings' || role === 'ADMIN' || role === 'MANAGER') &&
      (item.name !== 'users' || role === 'ADMIN') &&
      (item.name !== 'memberships' || role !== 'TRAINER') &&
      (item.name !== 'pricing-plans' || role !== 'TRAINER') &&
      (item.name !== 'payments' || role !== 'TRAINER') &&
      (item.name !== 'dashboard' || role !== 'TRAINER'),
    )),
    { key: 'logout', icon: <LogoutOutlined />, label: 'Выход', disabled: isPending, onClick: () => logout() },
  ]
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
        title={<ThemedTitle collapsed={false} text="Horse CRM" />}
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        styles={{ body: { padding: 0 } }}
      >
        <Menu mode="inline" items={items} selectedKeys={[selectedKey]} defaultOpenKeys={defaultOpenKeys}
          onClick={() => setMobileOpen(false)} />
      </Drawer>
    </>
  }

  return (
    <Layout.Sider theme="light" collapsible collapsed={collapsed} onCollapse={setCollapsed}
      breakpoint="lg" collapsedWidth={80} style={{ minHeight: '100vh' }}>
      <div style={{ height: 64, display: 'flex', alignItems: 'center', padding: '0 16px' }}>
        <ThemedTitle collapsed={collapsed} text="Horse CRM" />
      </div>
      <Menu mode="inline" items={items} selectedKeys={[selectedKey]} defaultOpenKeys={defaultOpenKeys} />
    </Layout.Sider>
  )
}
