import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button, Popover, Space } from 'antd'
import { DownOutlined } from '@ant-design/icons'

/** Keep row height stable while preserving each action's own permissions and confirmation. */
export function RowActions({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const content = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => content.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus())
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && (content.current?.contains(document.activeElement) || document.activeElement === trigger.current)) {
        setOpen(false); trigger.current?.focus()
      }
    }
    document.addEventListener('keydown', escape)
    return () => { cancelAnimationFrame(frame); document.removeEventListener('keydown', escape) }
  }, [open])
  return <Popover trigger="click" placement="bottomRight" open={open} onOpenChange={setOpen}
    content={<div ref={content}><Space direction="vertical" className="row-actions-menu">{children}</Space></div>}>
    <Button ref={trigger} size="small" aria-expanded={open} onClick={() => setOpen(!open)}>Действия <DownOutlined /></Button>
  </Popover>
}
