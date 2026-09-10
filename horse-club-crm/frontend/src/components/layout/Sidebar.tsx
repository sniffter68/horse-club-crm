import { useState } from 'react'
import { useLogout, useMenu, usePermissions, type TreeMenuItem } from '@refinedev/core'
import type { Role } from '../../authStorage'
import { ThemedTitle } from '@refinedev/antd'
import { LogoutOutlined, UnorderedListOutlined } from '@ant-design/icons'
import { Layout, Menu, type MenuProps } from 'antd'
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
  const { menuItems, selectedKey, defaultOpenKeys } = useMenu()
  const { mutate: logout, isPending } = useLogout()
  const { data: role } = usePermissions<Role>({})
  const items: MenuProps['items'] = [
    ...toMenuItems(menuItems.filter(item =>
      (item.name !== 'settings' || role === 'ADMIN' || role === 'MANAGER') &&
      (item.name !== 'users' || role === 'ADMIN') &&
      (item.name !== 'memberships' || role !== 'TRAINER'),
    )),
    { key: 'logout', icon: <LogoutOutlined />, label: 'Выход', disabled: isPending, onClick: () => logout() },
  ]
  return (
    <Layout.Sider theme="light" collapsible collapsed={collapsed} onCollapse={setCollapsed}
      breakpoint="lg" collapsedWidth={0} style={{ minHeight: '100vh' }}>
      <div style={{ height: 64, display: 'flex', alignItems: 'center', padding: '0 16px' }}>
        <ThemedTitle collapsed={collapsed} text="Horse CRM" />
      </div>
      <Menu mode="inline" items={items} selectedKeys={[selectedKey]} defaultOpenKeys={defaultOpenKeys} />
    </Layout.Sider>
  )
}
