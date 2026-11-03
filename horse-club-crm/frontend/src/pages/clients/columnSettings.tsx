import { ArrowDownOutlined, ArrowUpOutlined, SettingOutlined } from '@ant-design/icons'
import { Alert, Button, Checkbox, Popover, Space, Typography } from 'antd'
import { defaults, optionalColumns, type ColumnKey, type useClientColumns } from './useClientColumns'
import { useState } from 'react'

export function ClientColumnSettings({ settings, canManage }: {
  settings: ReturnType<typeof useClientColumns>; canManage: boolean
}) {
  const [open, setOpen] = useState(false)
  const available = settings.columns.filter(column => canManage || !['membership', 'vk'].includes(column.key))
  function move(key: ColumnKey, direction: -1 | 1) {
    const index = available.findIndex(column => column.key === key)
    const neighbor = available[index + direction]
    if (!neighbor) return
    const next = [...settings.columns]
    const from = next.findIndex(column => column.key === key)
    const to = next.findIndex(column => column.key === neighbor.key)
    ;[next[from], next[to]] = [next[to], next[from]]
    settings.update(next)
  }
  return <Popover trigger="click" open={open} onOpenChange={setOpen} placement="bottomRight" title="Настройка колонок" content={
    <Space direction="vertical" className="client-column-settings">
      <Typography.Text type="secondary">Клиент и телефон закреплены слева, действия — справа.</Typography.Text>
      {available.map((column, index) => {
        const label = optionalColumns.find(item => item.key === column.key)?.label ?? column.key
        return <div className="client-column-option" key={column.key}>
          <Checkbox checked={column.visible} onChange={event => settings.update(settings.columns.map(item =>
            item.key === column.key ? { ...item, visible: event.target.checked } : item))}>{label}</Checkbox>
          <Space size={4}>
            <Button size="small" icon={<ArrowUpOutlined />} aria-label={`${label}: выше`} disabled={index === 0} onClick={() => move(column.key, -1)} />
            <Button size="small" icon={<ArrowDownOutlined />} aria-label={`${label}: ниже`} disabled={index === available.length - 1} onClick={() => move(column.key, 1)} />
          </Space>
        </div>
      })}
      <Button size="small" onClick={() => settings.update(defaults())}>Сбросить настройки</Button>
      {settings.storageError && <Alert type="warning" role="status" message="Настройки действуют до перезагрузки: браузер не разрешил сохранение." />}
    </Space>
  }><Button icon={<SettingOutlined aria-hidden />} aria-label="Настройка колонок" aria-expanded={open} onClick={() => setOpen(!open)}>Настройка колонок</Button></Popover>
}
