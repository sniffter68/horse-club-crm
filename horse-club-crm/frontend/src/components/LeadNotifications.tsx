import { BellOutlined } from '@ant-design/icons'
import { usePermissions } from '@refinedev/core'
import { Button, Popover, Space, Switch, Typography } from 'antd'
import type { Role } from '../authStorage'
import { useLeadNotifications } from '../hooks/useLeadNotifications'
import { useState } from 'react'

function LeadNotificationControls() {
  const alerts = useLeadNotifications()
  const [open, setOpen] = useState(false)
  return <Space wrap>
    {alerts.permission === 'default' && <Button size="small" loading={alerts.requesting} onClick={() => void alerts.enable()}>
      Включить звуковые пуши о заявках
    </Button>}
    <Popover trigger="click" open={open} onOpenChange={setOpen} title="Уведомления о заявках" content={<Space direction="vertical" style={{ maxWidth: 280 }}>
      <Typography.Text role="status">{alerts.connected ? 'Ожидаем новые заявки с сайта' : 'Восстанавливаем связь с сервером…'}</Typography.Text>
      <Space><Switch aria-label="Звук новых заявок" checked={alerts.soundEnabled} onChange={alerts.toggleSound} /><span>Звук новых заявок</span></Space>
      {alerts.permission === 'granted' && <Typography.Text type="secondary">Системные уведомления включены</Typography.Text>}
      {alerts.permission === 'denied' && <Typography.Text type="secondary">Уведомления запрещены. Разрешите их в настройках сайта в браузере.</Typography.Text>}
      {alerts.permission === 'unsupported' && <Typography.Text type="secondary">Системные уведомления недоступны. Используйте поддерживаемый браузер и HTTPS.</Typography.Text>}
      {alerts.audioBlocked && <Button size="small" onClick={alerts.playSound}>Разрешить звук</Button>}
      <Typography.Text type="secondary">Оставьте CRM открытой — можно работать в другой вкладке.</Typography.Text>
    </Space>}>
      <Button icon={<BellOutlined />} onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Уведомления о заявках" title="Уведомления о заявках" />
    </Popover>
  </Space>
}

export function LeadNotifications() {
  const { data: role } = usePermissions<Role>({})
  // Lead details and processing are currently ADMIN-only on the server.
  return role === 'ADMIN' ? <LeadNotificationControls /> : null
}
