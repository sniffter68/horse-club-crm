import { useEffect, useRef, useState, type ComponentRef } from 'react'
import { ArrowDownOutlined, ArrowUpOutlined, SettingOutlined } from '@ant-design/icons'
import { Alert, Button, Checkbox, Popover, Space, Typography } from 'antd'
import type { ColumnDefinition, ColumnPreference } from '../hooks/useTableColumns'

export function TableColumnSettings<K extends string>({ settings, definitions, description = 'Основные данные закреплены слева, действия — справа.' }: {
  settings: { columns: ColumnPreference<K>[]; update: (next: ColumnPreference<K>[]) => void; storageError: boolean }
  definitions: readonly ColumnDefinition<K>[]
  description?: string
}) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<ComponentRef<typeof Button>>(null)
  useEffect(() => {
    if (!open) return
    const close = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      trigger.current?.focus()
    }
    document.addEventListener('keydown', close)
    return () => document.removeEventListener('keydown', close)
  }, [open])
  const available = settings.columns.filter(column => definitions.some(item => item.key === column.key))
  function move(key: K, direction: -1 | 1) {
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
    <Space direction="vertical" className="table-column-settings">
      <Typography.Text type="secondary">{description}</Typography.Text>
      {available.map((column, index) => {
        const label = definitions.find(item => item.key === column.key)?.label ?? column.key
        return <div className="table-column-option" key={column.key}>
          <Checkbox checked={column.visible} onChange={event => settings.update(settings.columns.map(item =>
            item.key === column.key ? { ...item, visible: event.target.checked } : item))}>{label}</Checkbox>
          <Space size={4}>
            <Button size="small" icon={<ArrowUpOutlined />} aria-label={`${label}: выше`} disabled={index === 0} onClick={() => move(column.key, -1)} />
            <Button size="small" icon={<ArrowDownOutlined />} aria-label={`${label}: ниже`} disabled={index === available.length - 1} onClick={() => move(column.key, 1)} />
          </Space>
        </div>
      })}
      <Button size="small" onClick={() => settings.update([
        ...definitions.map(({ key, visible }) => ({ key, visible })),
        ...settings.columns.filter(column => !definitions.some(item => item.key === column.key)),
      ])}>Сбросить настройки</Button>
      {settings.storageError && <Alert type="warning" role="status" message="Настройки действуют до перезагрузки: браузер не разрешил сохранение." />}
    </Space>
  }><Button ref={trigger} icon={<SettingOutlined aria-hidden />} aria-label="Настройка колонок" aria-expanded={open} onClick={() => setOpen(!open)}>Настройка колонок</Button></Popover>
}
